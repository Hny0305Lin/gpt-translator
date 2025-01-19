import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { exec } from 'child_process';
import { SingleBar } from 'cli-progress';
import { Config, TranslationOptions, TranslationResult, TokenUsage, LANGUAGE_NAMES, LanguageCode } from './types';
import { ensureDir, generateTargetPath, logger, pathExists, generateUniqueFileName } from './utils';
import { APIError, handleAPIError, isRetryableError, LANGUAGE_ERRORS, FILE_ERRORS } from './errors';
import { ProgressManager } from './progress';
import { MetadataManager } from './metadata';

export class Translator {
  private openai: OpenAI;
  private limit: ReturnType<typeof pLimit>;
  private config: Config;
  private progressManager: ProgressManager;
  private metadataManager: MetadataManager;

  /**
   * 语言检测缓存
   */
  private languageDetectionCache = new Map<string, LanguageCode>();

  /**
   * 计算文本的哈希值（用于缓存）
   */
  private hashText(text: string): string {
    const sample = text.slice(0, 500); // 只使用前500个字符
    return Buffer.from(sample).toString('base64');
  }

  /**
   * 任务优先级队列
   */
  private taskQueue: Array<{
    priority: number;
    task: () => Promise<TranslationResult>;
  }> = [];

  constructor(config: Config) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiEndpoint,
    });
    this.limit = pLimit(config.maxConcurrentTranslations);
    this.progressManager = new ProgressManager(config);
    this.metadataManager = new MetadataManager(config);
  }

  /**
   * 检查文件是否支持翻译
   */
  public isFileSupported(filePath: string): boolean {
    if (!this.config.supportedExtensions) return true;
    const ext = path.extname(filePath).toLowerCase();
    return this.config.supportedExtensions.includes(ext);
  }

  /**
   * 处理专有名词列表
   */
  private formatProperNouns(options: TranslationOptions): string {
    if (!options.skipProperNouns || !this.config.properNouns) {
      return '';
    }

    const { translations, patterns } = this.config.properNouns;
    const items: string[] = [];

    if (translations && Object.keys(translations).length > 0) {
      items.push('以下是专有名词对照表，请在翻译时使用对应的译文：');
      for (const [source, target] of Object.entries(translations)) {
        items.push(`${source} => ${target}`);
      }
    }

    if (patterns && patterns.length > 0) {
      items.push('\n以下模式的文本需要保持不变：');
      items.push(patterns.join('\n'));
    }

    if (this.config.properNouns.caseSensitive) {
      items.push('\n请注意区分大小写。');
    }

    return items.length > 0 ? items.join('\n') : '';
  }

  /**
   * 处理双语对照翻译
   */
  private formatBilingualContent(source: string, translation: string): string {
    const { bilingualMode } = this.config;
    if (!bilingualMode.enabled) {
      return translation;
    }

    const sourceLines = source.split('\n');
    const translationLines = translation.split('\n');

    if (bilingualMode.layout === 'parallel') {
      // 并行布局：原文和译文并排显示
      const maxLines = Math.max(sourceLines.length, translationLines.length);
      const result: string[] = [];

      for (let i = 0; i < maxLines; i++) {
        const sourceLine = sourceLines[i] || '';
        const translationLine = translationLines[i] || '';

        if (bilingualMode.alignParagraphs) {
          // 如果是空行，保持一致的空行
          if (!sourceLine.trim() && !translationLine.trim()) {
            result.push('');
            continue;
          }
        }

        const line = bilingualMode.showSourceFirst
          ? `${sourceLine}\n${translationLine}`
          : `${translationLine}\n${sourceLine}`;
        result.push(line);
      }

      return result.join('\n');
    } else {
      // 顺序布局：原文在前或译文在前
      return bilingualMode.showSourceFirst
        ? `${source}${bilingualMode.separator}${translation}`
        : `${translation}${bilingualMode.separator}${source}`;
    }
  }

  /**
   * 生成系统提示词
   */
  private generateSystemPrompt(options: TranslationOptions): string {
    const template = this.config.systemPromptTemplate;
    const properNounsPrompt = this.formatProperNouns(options);
    const bilingualPrompt = this.config.bilingualMode.enabled
      ? '请按照要求提供双语对照翻译，保持原文格式。'
      : '';

    if (template) {
      return template
        .replace('{SOURCE_LANG}', LANGUAGE_NAMES[options.languages.source])
        .replace('{TARGET_LANG}', LANGUAGE_NAMES[options.languages.target])
        .replace('{SKIP_PROPER_NOUNS}', options.skipProperNouns ?
          `请仅翻译文本内容，对于专有名词，请按照以下规则处理：\n${properNounsPrompt}` : '')
        .replace('{SKIP_CODE_BLOCKS}', options.skipCodeBlocks ?
          '请不要翻译代码块、命令行、配置项等技术内容，保持原样。' : '')
        .replace('{BILINGUAL_MODE}', bilingualPrompt);
    }

    return [
      `你是一个专业的翻译专家，负责将${LANGUAGE_NAMES[options.languages.source]}翻译成${LANGUAGE_NAMES[options.languages.target]}。`,
      '你需要确保翻译结果符合目标语言的语言习惯，',
      '你可以调整语气和风格，并考虑到某些词语的文化内涵和地区差异。',
      '作为翻译家，需将原文翻译成具有信达雅标准的译文：',
      '"信"即忠实于原文的内容与意图；',
      '"达"意味着译文应通顺易懂，表达清晰；',
      '"雅"则追求译文的文化审美和语言的优美。',
      '目标是创作出既忠于原作精神，又符合目标语言文化和读者审美的翻译。',
      '输出尽量输出完整内容，不要省略任何原文内容',
      options.skipProperNouns ? `对于专有名词，请按照以下规则处理：\n${this.formatProperNouns(options)}` : '',
      options.skipCodeBlocks ? '请不要调整代码块、命令行、配置项等技术内容，包括一些 HTML, CSS 等等样式定义，保持原样。' : '',
      '请保持原文的格式和标点符号。',
    ].filter(Boolean).join('\n');
  }

  /**
   * 自动检测语言
   */
  private async detectLanguage(text: string): Promise<LanguageCode> {
    try {
      // 使用文本哈希作为缓存键
      const hash = this.hashText(text);
      const cached = this.languageDetectionCache.get(hash);
      if (cached) {
        return cached;
      }

      // 只使用前1000个字符进行检测
      const sample = text.slice(0, 1000);

      const response = await this.withRetry(() =>
        this.openai.chat.completions.create({
          model: this.config.modelName,
          messages: [
            {
              role: 'system',
              content: '你是一个语言检测专家。请分析给定文本的语言，只返回语言代码（如：en, zh, ja等）。'
            },
            { role: 'user', content: sample }
          ],
          temperature: 0,
        })
      );

      const detectedLang = response.choices[0].message.content?.trim().toLowerCase() as LanguageCode;

      if (!detectedLang || !LANGUAGE_NAMES[detectedLang]) {
        throw new APIError(
          LANGUAGE_ERRORS.DETECTION_FAILED.message,
          -1,
          LANGUAGE_ERRORS.DETECTION_FAILED.suggestion
        );
      }

      // 缓存检测结果
      this.languageDetectionCache.set(hash, detectedLang);
      return detectedLang;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        LANGUAGE_ERRORS.DETECTION_FAILED.message,
        -1,
        LANGUAGE_ERRORS.DETECTION_FAILED.suggestion
      );
    }
  }

  /**
   * 生成报告
   */
  private generateReport(results: TranslationResult[], totalDuration: number): string {
    const now = new Date().toISOString();
    const totalFiles = results.length;
    const totalTokens = results.reduce((sum, r) => sum + r.tokenUsage.inputTokens, 0);
    const totalCost = results.reduce((sum, r) => sum + r.tokenUsage.estimatedCost, 0);
    const averageSpeed = totalTokens / (totalDuration / 1000);

    const report = [
      '# 翻译报告',
      `\n## 基本信息`,
      `- 完成时间：${now}`,
      `- 总耗时：${this.formatDuration(totalDuration)}`,
      `- 总文件数：${totalFiles}`,
      `- 总Token数：${totalTokens.toLocaleString()}`,
      `- 平均速度：${Math.round(averageSpeed)} tokens/s`,
      `- 总费用：$${totalCost.toFixed(6)}`,
      '\n## 文件详情',
    ];

    results.forEach(result => {
      const duration = result.duration || 0;
      const speed = result.tokenUsage.inputTokens / (duration / 1000);

      report.push(
        `\n### ${result.sourcePath}`,
        `- 目标文件：${result.targetPath}`,
        `- 耗时：${this.formatDuration(duration)}`,
        `- 速度：${Math.round(speed)} tokens/s`,
        `- 输入Token：${result.tokenUsage.inputTokens.toLocaleString()}`,
        `- 输出Token：${result.tokenUsage.estimatedOutputTokens.toLocaleString()}`,
        `- 费用：$${result.tokenUsage.estimatedCost.toFixed(6)}`
      );
    });

    return report.join('\n');
  }

  /**
   * 打开输出目录
   */
  private async openOutputDir(dir: string): Promise<void> {
    if (!this.config.openOutputDir) return;

    const command = process.platform === 'win32'
      ? `explorer "${dir}"`
      : process.platform === 'darwin'
        ? `open "${dir}"`
        : `xdg-open "${dir}"`;

    exec(command, (error) => {
      if (error) {
        logger.warn(`无法打开输出目录：${error.message}`);
      }
    });
  }

  /**
   * 计算token数量（使用 DeepSeek 的算法）
   * 参考：https://api-docs.deepseek.com/zh-cn/quick_start/token_usage
   */
  private estimateTokenCount(text: string): number {
    // 中文字符（包括标点）
    const chineseChars = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uff60]/g) || [];
    // 英文单词和数字
    const englishAndNumbers = text.match(/[a-zA-Z0-9]+/g) || [];
    // 其他字符（标点符号等）
    const otherChars = text.match(/[^a-zA-Z0-9\u4e00-\u9fff\u3000-\u303f\uff00-\uff60\s]/g) || [];

    // 中文字符算 2 个 token
    const chineseTokens = chineseChars.length * 2;
    // 英文单词和数字算 1 个 token
    const englishTokens = englishAndNumbers.length;
    // 其他字符算 1 个 token
    const otherTokens = otherChars.length;

    return chineseTokens + englishTokens + otherTokens;
  }

  /**
   * 计算翻译成本
   */
  private calculateCost(tokenCount: number, options: TranslationOptions): number {
    const inputRate = (options.inputPricePerMillionTokens || this.config.defaultInputPricePerMillionTokens || 0.2) / 1000000;
    const outputRate = (options.outputPricePerMillionTokens || this.config.defaultOutputPricePerMillionTokens || 0.2) / 1000000;
    const inputCost = tokenCount * inputRate;
    const estimatedOutputTokens = tokenCount * 1.3; // 假设输出token数约为输入的1.3倍
    const outputCost = estimatedOutputTokens * outputRate;
    return inputCost + outputCost;
  }

  /**
   * 预估整个任务的 token 使用量和成本
   */
  public async estimateUsage(options: TranslationOptions): Promise<TokenUsage> {
    const { input } = options;
    let totalInputTokens = 0;

    try {
      if (fs.statSync(input).isFile()) {
        if (!this.isFileSupported(input)) {
          throw new APIError(
            '不支持的文件类型',
            -1,
            `仅支持以下文件类型：${this.config.supportedExtensions?.join(', ')}`
          );
        }
        const content = await fs.promises.readFile(input, 'utf-8');
        totalInputTokens = this.estimateTokenCount(content);
      } else {
        const files = fs.readdirSync(input);
        for (const file of files) {
          const filePath = path.join(input, file);
          if (fs.statSync(filePath).isFile() && this.isFileSupported(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            totalInputTokens += this.estimateTokenCount(content);
          }
        }
      }

      const estimatedOutputTokens = Math.ceil(totalInputTokens * 1.3);
      const estimatedCost = this.calculateCost(totalInputTokens, options);

      return {
        inputTokens: totalInputTokens,
        estimatedOutputTokens,
        estimatedCost,
      };
    } catch (error) {
      throw new APIError(
        '计算 token 使用量失败',
        -1,
        '请检查输入文件路径是否正确，以及是否有读取权限'
      );
    }
  }

  /**
   * 重试机制
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.config.retryDelay || 1000;
    const maxRetries = this.config.retryCount || 3;
    const maxDelay = this.config.maxRetryDelay || 30000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const apiError = handleAPIError(error);

        // 某些错误不应该重试
        if (!isRetryableError(apiError)) {
          throw apiError;
        }

        if (i < maxRetries - 1) {
          // 使用指数退避策略，但设置最大延迟
          delay = Math.min(delay * Math.pow(2, i), maxDelay);

          logger.warn(`${apiError.message}`);
          logger.warn(`建议：${apiError.suggestion}`);
          logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * 检查文件大小是否超过限制
   */
  private checkFileSize(filePath: string): void {
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > this.config.maxFileSize) {
      throw new APIError(
        '文件过大',
        -1,
        `文件大小（${fileSizeMB.toFixed(2)}MB）超过限制（${this.config.maxFileSize}MB）`
      );
    }
  }

  /**
   * 读取文件内容
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      // 尝试以 UTF-8 读取
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid character')) {
        // 如果 UTF-8 读取失败，尝试其他编码
        const buffer = await fs.promises.readFile(filePath);
        // 这里可以使用 iconv-lite 或其他库进行编码检测和转换
        return buffer.toString('utf-8');
      }
      throw error;
    }
  }

  /**
   * 写入文件内容
   */
  private async writeFileContent(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    try {
      // 先写入临时文件
      await fs.promises.writeFile(tempPath, content, 'utf-8');
      // 如果目标文件存在，先删除
      if (await pathExists(filePath)) {
        await fs.promises.unlink(filePath);
      }
      // 重命名临时文件
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      // 清理临时文件
      if (await pathExists(tempPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * 翻译单个文件
   */
  private async translateFile(
    sourcePath: string,
    targetPath: string,
    options: TranslationOptions,
    progressBar?: SingleBar | null
  ): Promise<TranslationResult> {
    const startTime = Date.now();
    let content = '';

    try {
      if (!this.isFileSupported(sourcePath)) {
        throw new APIError(
          FILE_ERRORS.UNSUPPORTED_TYPE.message,
          -1,
          FILE_ERRORS.UNSUPPORTED_TYPE.suggestion
        );
      }

      // 检查文件大小
      this.checkFileSize(sourcePath);

      // 读取文件内容
      if (progressBar) {
        this.progressManager.updateStatus(progressBar, '读取文件...');
      }
      content = await this.readFileContent(sourcePath);

      // 如果文件为空且配置了忽略空文件
      if (content.trim().length === 0 && this.config.ignoreEmptyFiles) {
        throw new APIError(
          FILE_ERRORS.EMPTY_FILE.message,
          -1,
          FILE_ERRORS.EMPTY_FILE.suggestion
        );
      }

      // 如果未指定源语言，尝试自动检测
      if (!options.languages.source) {
        if (progressBar) {
          this.progressManager.updateStatus(progressBar, '检测语言...');
        }
        options.languages.source = await this.detectLanguage(content);
        logger.info(`检测到源语言：${LANGUAGE_NAMES[options.languages.source]}`);
      }

      const tokenCount = this.estimateTokenCount(content);
      const estimatedCost = this.calculateCost(tokenCount, options);

      if (progressBar) {
        this.progressManager.updateProgress(progressBar, 0, '计算成本...');
      }
      logger.info(`预估成本 ${path.basename(sourcePath)}: $${estimatedCost.toFixed(6)}`);

      // 确保目标目录存在
      ensureDir(path.dirname(targetPath));

      // 如果目标文件已存在且启用了自动重命名
      if (this.config.autoRename && await pathExists(targetPath)) {
        targetPath = generateUniqueFileName(targetPath);
      }

      if (progressBar) {
        this.progressManager.updateProgress(progressBar, 0, '翻译中...');
      }

      // 使用流式传输发送翻译请求
      const stream = await this.withRetry(() =>
        this.openai.chat.completions.create({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: this.generateSystemPrompt(options) },
            { role: 'user', content }
          ],
          temperature: this.config.temperature || 0.3,
          stream: true,
        })
      );

      let translatedContent = '';
      let progress = 0;
      let lastProgressUpdate = Date.now();
      const progressUpdateInterval = 100; // 每100ms更新一次进度

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        translatedContent += content;

        // 更新进度条，但限制更新频率
        if (progressBar && Date.now() - lastProgressUpdate >= progressUpdateInterval) {
          progress = Math.min(progress + content.length / tokenCount * 100, 99);
          this.progressManager.updateProgress(progressBar, progress, '翻译中...');
          lastProgressUpdate = Date.now();
        }
      }

      // 准备最终内容
      let finalContent = '';

      // 添加元数据
      const metadata = this.metadataManager.generate(options);
      if (metadata) {
        finalContent += metadata;
      }

      // 处理双语对照翻译
      const processedContent = this.formatBilingualContent(content, translatedContent);

      // 如果需要保留原文且未启用双语对照
      if (this.config.keepOriginalContent && !this.config.bilingualMode.enabled) {
        finalContent += content + this.config.contentSeparator;
      }

      // 添加翻译内容
      finalContent += processedContent;

      // 写入文件
      if (progressBar) {
        this.progressManager.updateProgress(progressBar, 99, '保存文件...');
      }
      await this.writeFileContent(targetPath, finalContent);

      if (progressBar) {
        this.progressManager.updateProgress(progressBar, 100, '完成');
      }

      // 如果启用了自动重命名，添加语言后缀
      if (this.config.autoRename) {
        const ext = path.extname(targetPath);
        const newPath = targetPath.replace(ext, `.${options.languages.target}${ext}`);
        await fs.promises.rename(targetPath, newPath);
        targetPath = newPath;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      return {
        sourcePath,
        targetPath,
        tokenUsage: {
          inputTokens: tokenCount,
          estimatedOutputTokens: Math.ceil(tokenCount * 1.3),
          estimatedCost,
        },
        duration,
      };
    } catch (error) {
      if (progressBar) {
        this.progressManager.updateProgress(progressBar, 0, '失败');
      }
      throw error;
    }
  }

  /**
   * 添加翻译任务到队列
   */
  private async addTask(
    priority: number,
    task: () => Promise<TranslationResult>
  ): Promise<TranslationResult> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({
        priority,
        task: async () => {
          try {
            const result = await task();
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        }
      });
      // 按优先级排序
      this.taskQueue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * 执行队列中的任务
   */
  private async processTasks(concurrency: number): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    const limit = pLimit(concurrency);
    const running = new Set<Promise<TranslationResult>>();

    while (this.taskQueue.length > 0) {
      const { task } = this.taskQueue.shift()!;
      const promise = limit(async () => {
        try {
          return await task();
        } catch (error) {
          // 如果是可重试的错误，将任务重新加入队列
          if (isRetryableError(error)) {
            this.taskQueue.push({ priority: 0, task });
          }
          throw error;
        }
      });

      running.add(promise);
      promise
        .then(result => {
          results.push(result);
          running.delete(promise);
        })
        .catch(() => {
          running.delete(promise);
        });
    }

    // 等待所有任务完成
    await Promise.all(Array.from(running));
    return results;
  }

  /**
   * 递归获取所有文件
   */
  public getAllFiles(dir: string, depth: number = 0): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果配置了递归翻译且未超过最大深度
        if (this.config.recursiveTranslation &&
            (this.config.maxRecursiveDepth === 0 || depth < this.config.maxRecursiveDepth)) {
          files.push(...this.getAllFiles(fullPath, depth + 1));
        }
      } else if (entry.isFile() && this.isFileSupported(fullPath)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${minutes % 60}m${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 翻译文件或目录
   */
  public async translate(options: TranslationOptions): Promise<TranslationResult[]> {
    const { input } = options;
    const startTime = Date.now();

    try {
      const stats = fs.statSync(input);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        // 获取所有需要翻译的文件
        const files = this.getAllFiles(input);

        if (files.length === 0) {
          throw new APIError(
            FILE_ERRORS.NOT_FOUND.message,
            -1,
            FILE_ERRORS.NOT_FOUND.suggestion
          );
        }

        // 创建总进度条
        const totalBar = this.progressManager.createBar('总进度', 100, '总计');
        let completedFiles = 0;
        let totalTokens = 0;
        let totalCost = 0;

        // 将所有文件添加到任务队列
        const promises = files.map((filePath, index) => {
          // 计算相对路径，用于在输出目录中保持相同的目录结构
          const relativePath = path.relative(input, filePath);
          const targetPath = path.join(options.output, relativePath);
          const fileBar = this.progressManager.createBar(
            `文件 ${index + 1}/${files.length}`,
            100,
            path.basename(filePath)
          );

          // 根据文件大小设置优先级（小文件优先）
          const stats = fs.statSync(filePath);
          const priority = Math.max(0, 1000 - Math.floor(stats.size / 1024));

          return this.addTask(priority, async () => {
            try {
              // 确保目标目录存在
              ensureDir(path.dirname(targetPath));
              const result = await this.translateFile(filePath, targetPath, options, fileBar);

              completedFiles++;
              totalTokens += result.tokenUsage.inputTokens;
              totalCost += result.tokenUsage.estimatedCost;

              if (totalBar) {
                this.progressManager.updateTotalProgress(totalBar, completedFiles, files.length);
              }

              return result;
            } catch (error) {
              logger.error(`翻译失败：${relativePath}`);
              logger.error(error instanceof Error ? error.message : String(error));

              completedFiles++;
              if (totalBar) {
                this.progressManager.updateTotalProgress(totalBar, completedFiles, files.length);
              }

              throw error;
            }
          });
        });

        // 处理任务队列
        const results = await this.processTasks(options.concurrency);
        const endTime = Date.now();

        this.progressManager.stop();

        // 过滤掉失败的结果
        const validResults = results.filter((r): r is TranslationResult => r !== null);

        // 生成报告
        if (this.config.generateReport) {
          const reportPath = path.join(options.output, 'translation-report.md');
          await fs.promises.writeFile(
            reportPath,
            this.generateReport(validResults, endTime - startTime)
          );
        }

        // 打开输出目录
        await this.openOutputDir(options.output);

        return validResults;
      } else {
        const targetPath = generateTargetPath(input, options.output);
        const fileBar = this.progressManager.createBar('翻译进度', 100, path.basename(input));
        const result = await this.translateFile(input, targetPath, options, fileBar);
        const endTime = Date.now();

        this.progressManager.stop();

        const results = [result];

        // 生成报告
        if (this.config.generateReport) {
          const reportPath = path.join(options.output, 'translation-report.md');
          await fs.promises.writeFile(
            reportPath,
            this.generateReport(results, endTime - startTime)
          );
        }

        // 打开输出目录
        await this.openOutputDir(options.output);

        return results;
      }
    } catch (error) {
      this.progressManager.stop();
      throw error;
    }
  }
}
