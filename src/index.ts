#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import { createInterface } from 'readline';
import { loadConfig } from './config';
import { Translator } from './translator';
import { logger, pathExists } from './utils';
import { TranslationOptions, LanguageCode, LANGUAGE_NAMES, Config } from './types';
import { APIError } from './errors';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const program = new Command();
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
};

/**
 * 解析语言对
 */
function parseLanguagePair(pair?: string): { source: LanguageCode; target: LanguageCode } | null {
  if (!pair) return null;
  const match = pair.match(/^([a-z]{2})-([a-z]{2})$/);
  if (!match) return null;

  const [, source, target] = match;
  if (!LANGUAGE_NAMES[source as LanguageCode] || !LANGUAGE_NAMES[target as LanguageCode]) {
    return null;
  }

  return {
    source: source as LanguageCode,
    target: target as LanguageCode
  };
}

/**
 * 显示标题
 */
function showTitle(): void {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════╗
║           GPT Translator v1.0.0           ║
║      AI驱动的多语言文件翻译工具               ║
╚═══════════════════════════════════════════╝
`));
}

/**
 * 显示支持的语言列表
 */
function showSupportedLanguages(): void {
  logger.info('\n支持的语言：');
  const columns = process.stdout.columns || 80;
  const maxCodeLength = Math.max(...Object.keys(LANGUAGE_NAMES).map(code => code.length));
  const maxNameLength = Math.max(...Object.values(LANGUAGE_NAMES).map(name => name.length));
  const itemWidth = maxCodeLength + maxNameLength + 8; // 8 是额外的空间和分隔符
  const itemsPerRow = Math.floor(columns / itemWidth) || 1;

  Object.entries(LANGUAGE_NAMES)
    .reduce((rows: string[][], [code, name], index) => {
      const rowIndex = Math.floor(index / itemsPerRow);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex].push(`${chalk.yellow(code.padEnd(maxCodeLength))} - ${chalk.green(name.padEnd(maxNameLength))}`);
      return rows;
    }, [])
    .forEach(row => {
      logger.info('  ' + row.join('    '));
    });

  logger.info('\n常用语言对示例：');
  [
    ['zh-en', '中文 → 英语'],
    ['en-zh', '英语 → 中文'],
    ['ja-zh', '日语 → 中文'],
    ['zh-ja', '中文 → 日语'],
  ].forEach(([pair, desc]) => {
    logger.info(`  ${chalk.yellow(pair.padEnd(8))} ${chalk.gray('|')} ${desc}`);
  });
}

/**
 * 显示专有名词对照表
 */
function showProperNouns(config: Config) {
  if (!config.skipProperNouns || !config.properNouns) {
    return;
  }

  const { translations, patterns } = config.properNouns;

  console.log('\n专有名词配置：');

  if (Object.keys(translations).length > 0) {
    console.log(chalk.cyan('\n对照表：'));
    for (const [source, target] of Object.entries(translations)) {
      console.log(`  ${chalk.yellow(source)} => ${chalk.green(target)}`);
    }
  }

  if (patterns.length > 0) {
    console.log(chalk.cyan('\n匹配模式：'));
    patterns.forEach((pattern: string) => {
      console.log(`  ${chalk.yellow(pattern)}`);
    });
  }

  if (config.properNouns.caseSensitive) {
    console.log(chalk.gray('\n* 区分大小写'));
  }
  console.log(); // 空行
}

/**
 * 显示任务信息
 */
function showTaskInfo(options: TranslationOptions, files: string[]) {
  console.log('\n任务信息：');
  console.log(`输入：${chalk.yellow(options.input)}`);
  console.log(`输出：${chalk.yellow(options.output)}`);
  console.log(`源语言：${chalk.cyan(LANGUAGE_NAMES[options.languages.source])}`);
  console.log(`目标语言：${chalk.cyan(LANGUAGE_NAMES[options.languages.target])}`);
  console.log(`文件数量：${chalk.green(files.length)}`);

  if (files.length > 0) {
    console.log('\n待翻译文件：');
    // 最多显示5个文件
    const maxDisplay = 5;
    files.slice(0, maxDisplay).forEach((file, index) => {
      const relativePath = path.relative(options.input, file);
      console.log(`  ${chalk.gray(index + 1)}. ${chalk.yellow(relativePath)}`);
    });

    // 如果有更多文件，显示省略信息
    if (files.length > maxDisplay) {
      console.log(`  ${chalk.gray('...')} 等共 ${chalk.green(files.length)} 个文件`);
    }
  }
  console.log(); // 空行
}

/**
 * 显示配置信息
 */
function showConfigInfo(config: TranslationOptions & { config: any }): void {
  logger.info('\n功能设置：');
  [
    ['并发数', config.concurrency],
    ['专有名词', config.skipProperNouns ? '保持不变' : '翻译'],
    ['代码块', config.skipCodeBlocks ? '保持不变' : '翻译'],
    ['原文保留', config.config.keepOriginalContent ? '是' : '否'],
    ['自动重命名', config.config.autoRename ? '是' : '否'],
    ['空文件处理', config.config.ignoreEmptyFiles ? '忽略' : '处理'],
    ['完成后操作', config.config.openOutputDir ? '打开目录' : '无'],
    ['进度显示', config.config.showProgressBar ? '是' : '否'],
    ['生成报告', config.config.generateReport ? (config.config.reportFormat || 'markdown') : '否'],
    ['递归翻译', config.config.recursiveTranslation ? (config.config.maxRecursiveDepth === 0 ? '无限制' : `最大${config.config.maxRecursiveDepth}层`) : '否'],
    ['双语对照', config.config.bilingualMode?.enabled ? (
      `${config.config.bilingualMode.layout === 'parallel' ? '并行' : '顺序'} | ` +
      `${config.config.bilingualMode.showSourceFirst ? '原文在前' : '译文在前'} | ` +
      `${config.config.bilingualMode.alignParagraphs ? '段落对齐' : '不对齐'}`
    ) : '否'],
  ].forEach(([key, value]) => {
    logger.info(`  ${chalk.gray('•')} ${key.padEnd(8)}${chalk.gray('|')} ${value}`);
  });
}

/**
 * 显示成本信息
 */
function showCostInfo(usage: { inputTokens: number; estimatedOutputTokens: number; estimatedCost: number }): void {
  logger.info('\n成本预估：');
  logger.info(`输入 Token：${chalk.yellow(usage.inputTokens.toLocaleString())}`);
  logger.info(`预估输出 Token：${chalk.yellow(usage.estimatedOutputTokens.toLocaleString())}`);
  logger.info(`预估总成本：${chalk.green('$' + usage.estimatedCost.toFixed(6))}`);
}

program
  .name('gpt-translator')
  .description('使用 GPT 翻译文件或目录')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', '输入文件或目录路径')
  .requiredOption('-o, --output <path>', '输出文件或目录路径')
  .option('-l, --languages <pair>', '语言对，格式：源语言-目标语言，例如：zh-en、en-ja')
  .option('-s, --skip-proper-nouns', '保持专有名词不变')
  .option('-c, --skip-code-blocks', '保持代码块不变')
  .option('-n, --concurrency <number>', '并发翻译数量')
  .option('--input-price <number>', '输入文本每百万 token 的价格（美元）')
  .option('--output-price <number>', '输出文本每百万 token 的价格（美元）')
  .option('--auto-detect', '自动检测源语言')
  .option('--keep-original', '保留原文')
  .option('--auto-rename', '自动重命名输出文件（添加语言后缀）')
  .option('--ignore-empty', '忽略空文件')
  .option('--open-output', '翻译完成后打开输出目录')
  .option('--recursive', '递归翻译子目录')
  .option('--max-depth <number>', '最大递归深度（0表示无限制）')
  .option('--max-file-size <number>', '最大文件大小限制（MB）')
  .option('--temperature <number>', '温度参数 (0-1)')
  .option('--retry-count <number>', '重试次数')
  .option('--retry-delay <number>', '重试延迟（毫秒）')
  .option('--max-retry-delay <number>', '最大重试延迟（毫秒）')
  .option('--no-progress', '不显示进度条')
  .option('--report [format]', '生成翻译报告')
  .option('--list-languages', '显示支持的语言列表')
  .option('--bilingual', '启用双语对照翻译')
  .option('--bilingual-layout <type>', '双语对照布局方式 (parallel/sequential)', 'parallel')
  .option('--bilingual-separator <separator>', '双语对照分隔符', '\n---\n')
  .option('--source-first', '原文显示在前（默认译文在前）')
  .option('--align-paragraphs', '对齐段落')
  .action(async (options) => {
    // 显示标题
    showTitle();

    // 如果只是显示语言列表，则显示后退出
    if (options.listLanguages) {
      showSupportedLanguages();
      rl.close();
      process.exit(0);
    }

    const spinner = ora();

    try {
      // 检查输入路径是否存在
      if (!pathExists(options.input)) {
        throw new APIError(
          '输入路径不存在',
          -1,
          `请检查路径是否正确：${options.input}`
        );
      }

      // 如果未指定语言对且未启用自动检测，则报错
      if (!options.languages && !options.autoDetect) {
        throw new APIError(
          '未指定语言对',
          -1,
          '请使用 -l 或 --languages 指定语言对，或使用 --auto-detect 启用自动检测。\n' +
          '可以使用 --list-languages 查看支持的语言列表。'
        );
      }

      // 解析语言对
      const languagePair = parseLanguagePair(options.languages);
      if (!options.autoDetect && !languagePair) {
        throw new APIError(
          '语言对格式错误',
          -1,
          '请使用正确的格式，例如：zh-en、en-ja。\n' +
          '可以使用 --list-languages 查看支持的语言列表。'
        );
      }

      // 加载配置
      const config = loadConfig();

      // 命令行配置覆盖 .env 配置
      const mergedConfig = {
        ...config,
        // 翻译设置
        ...(options.concurrency && { maxConcurrentTranslations: parseInt(options.concurrency, 10) }),
        ...(options.retryCount && { retryCount: parseInt(options.retryCount, 10) }),
        ...(options.retryDelay && { retryDelay: parseInt(options.retryDelay, 10) }),
        ...(options.maxRetryDelay && { maxRetryDelay: parseInt(options.maxRetryDelay, 10) }),
        ...(options.temperature && { temperature: parseFloat(options.temperature) }),
        ...(options.maxFileSize && { maxFileSize: parseInt(options.maxFileSize, 10) }),

        // 价格设置
        ...(options.inputPrice && { defaultInputPricePerMillionTokens: parseFloat(options.inputPrice) }),
        ...(options.outputPrice && { defaultOutputPricePerMillionTokens: parseFloat(options.outputPrice) }),

        // 文件设置
        ...(typeof options.recursive !== 'undefined' && { recursiveTranslation: options.recursive }),
        ...(options.maxDepth && { maxRecursiveDepth: parseInt(options.maxDepth, 10) }),
        ...(typeof options.autoRename !== 'undefined' && { autoRename: options.autoRename }),
        ...(typeof options.ignoreEmpty !== 'undefined' && { ignoreEmptyFiles: options.ignoreEmpty }),
        ...(typeof options.openOutput !== 'undefined' && { openOutputDir: options.openOutput }),

        // 内容设置
        ...(typeof options.keepOriginal !== 'undefined' && { keepOriginalContent: options.keepOriginal }),
        ...(typeof options.skipProperNouns !== 'undefined' && { skipProperNouns: options.skipProperNouns }),
        ...(typeof options.skipCodeBlocks !== 'undefined' && { skipCodeBlocks: options.skipCodeBlocks }),
        ...(typeof options.autoDetect !== 'undefined' && { autoDetectLanguage: options.autoDetect }),

        // 进度和报告设置
        ...(typeof options.progress !== 'undefined' && { showProgressBar: options.progress }),
        ...(typeof options.report !== 'undefined' && {
          generateReport: !!options.report,
          ...(options.report && { reportFormat: options.report === true ? 'markdown' : options.report })
        }),

        // 双语对照翻译设置
        ...(typeof options.bilingual !== 'undefined' && {
          bilingualMode: {
            enabled: options.bilingual,
            layout: options.bilingualLayout as 'parallel' | 'sequential',
            separator: options.bilingualSeparator,
            showSourceFirst: options.sourceFirst || false,
            alignParagraphs: options.alignParagraphs || false,
          }
        }),
      };

      const translationOptions: TranslationOptions = {
        input: options.input,
        output: options.output,
        languages: languagePair || { source: 'en' as LanguageCode, target: 'zh' },
        skipProperNouns: mergedConfig.skipProperNouns,
        skipCodeBlocks: mergedConfig.skipCodeBlocks,
        concurrency: mergedConfig.maxConcurrentTranslations,
        inputPricePerMillionTokens: mergedConfig.defaultInputPricePerMillionTokens,
        outputPricePerMillionTokens: mergedConfig.defaultOutputPricePerMillionTokens,
      };

      // 创建翻译器实例
      const translator = new Translator(mergedConfig);

      // 获取待翻译的文件列表
      const files = fs.statSync(options.input).isDirectory()
        ? translator.getAllFiles(options.input)
        : [options.input];

      // 显示专有名词配置
      showProperNouns(mergedConfig);

      // 显示任务信息
      showTaskInfo(translationOptions, files);

      // 显示配置信息
      showConfigInfo({ ...translationOptions, config: mergedConfig });

      // 预估成本
      spinner.start('正在计算预估成本...');
      const usage = await translator.estimateUsage(translationOptions);
      spinner.stop();

      // 显示成本信息
      showCostInfo(usage);

      // 显示翻译方向
      if (languagePair) {
        logger.info(`\n翻译方向：${chalk.yellow(LANGUAGE_NAMES[languagePair.source])} ${chalk.gray('->')} ${chalk.green(LANGUAGE_NAMES[languagePair.target])}`);
      } else {
        logger.info('\n已启用源语言自动检测');
        logger.info(`目标语言：${chalk.green(LANGUAGE_NAMES[translationOptions.languages.target])}`);
      }

      // 询问用户是否继续
      const answer = await question('\n是否继续翻译？(y/N) ');
      if (answer.toLowerCase() !== 'y') {
        logger.info('已取消翻译。');
        rl.close();
        process.exit(0);
      }

      // 执行翻译
      const results = await translator.translate(translationOptions);

      // 显示翻译结果统计
      const totalFiles = results.length;
      const totalTokens = results.reduce((sum, r) => sum + r.tokenUsage.inputTokens, 0);
      const totalCost = results.reduce((sum, r) => sum + r.tokenUsage.estimatedCost, 0);

      logger.success('\n翻译完成！');
      logger.info(`总文件数：${chalk.yellow(totalFiles.toString())}`);
      logger.info(`总Token数：${chalk.yellow(totalTokens.toLocaleString())}`);
      logger.info(`总费用：${chalk.green('$' + totalCost.toFixed(6))}`);

      if (options.report) {
        logger.info(`\n报告已生成：${chalk.cyan(path.join(options.output, 'translation-report.' + options.report))}`);
      }

      rl.close();
      process.exit(0);
    } catch (error) {
      spinner.stop();

      if (error instanceof APIError) {
        logger.error(`\n${chalk.red('错误：')}${error.message}`);
        logger.error(`${chalk.yellow('建议：')}${error.suggestion}`);
        if (error.code !== -1) {
          logger.error(`${chalk.gray('错误代码：')}${error.code}`);
        }
      } else {
        logger.error(`\n${chalk.red('意外错误：')}${(error as Error).message}`);
      }

      rl.close();
      process.exit(1);
    }
  });

program.parse();
