export type LanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'ru' | 'ar' | 'hi' | 'pt' | 'it';

export interface LanguagePair {
  source: LanguageCode;
  target: LanguageCode;
}

export interface MetadataTemplate {
  /** 元数据开始标记 */
  startMark?: string;
  /** 元数据结束标记 */
  endMark?: string;
  /** 元数据格式模板 */
  template?: string;
  /** 是否包含时间戳 */
  includeTimestamp?: boolean;
  /** 是否包含模型信息 */
  includeModel?: boolean;
  /** 是否包含翻译配置 */
  includeConfig?: boolean;
  /** 自定义字段 */
  customFields?: Record<string, string>;
}

export interface TranslationOptions {
  /** 输入路径（文件或文件夹） */
  input: string;
  /** 输出路径 */
  output: string;
  /** 源语言和目标语言 */
  languages: LanguagePair;
  /** 是否跳过专有名词翻译 */
  skipProperNouns: boolean;
  /** 是否跳过代码块翻译 */
  skipCodeBlocks: boolean;
  /** 并发翻译数量 */
  concurrency: number;
  /** 每百万 token 的输入价格（美元） */
  inputPricePerMillionTokens?: number;
  /** 每百万 token 的输出价格（美元） */
  outputPricePerMillionTokens?: number;
}

export interface Config {
  /** API 端点 */
  apiEndpoint: string;
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 */
  modelName: string;
  /** 最大并发翻译数量 */
  maxConcurrentTranslations: number;
  /** 重试次数 */
  retryCount: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 最大重试延迟（毫秒） */
  maxRetryDelay: number;
  /** 温度参数 (0-1) */
  temperature: number;
  /** 默认每百万 token 的输入价格（美元） */
  defaultInputPricePerMillionTokens: number;
  /** 默认每百万 token 的输出价格（美元） */
  defaultOutputPricePerMillionTokens: number;
  /** 支持的文件扩展名 */
  supportedExtensions?: string[];
  /** 是否在翻译时保留原文 */
  keepOriginalContent: boolean;
  /** 翻译时是否添加元数据 */
  addMetadata: boolean;
  /** 元数据模板配置 */
  metadataTemplate: MetadataTemplate;
  /** 自定义系统提示词模板 */
  systemPromptTemplate: string;
  /** 原文与译文之间的分隔符 */
  contentSeparator: string;
  /** 是否自动检测源语言 */
  autoDetectLanguage: boolean;
  /** 是否在输出目录已存在时自动重命名 */
  autoRename: boolean;
  /** 是否忽略空文件 */
  ignoreEmptyFiles: boolean;
  /** 是否在翻译完成后自动打开输出目录 */
  openOutputDir: boolean;
  /** 是否显示翻译进度条 */
  showProgressBar: boolean;
  /** 是否在翻译完成后生成报告 */
  generateReport: boolean;
  /** 报告输出格式 (json, markdown, text) */
  reportFormat: 'json' | 'markdown' | 'text';
  /** 是否递归翻译子目录 */
  recursiveTranslation: boolean;
  /** 最大递归深度 */
  maxRecursiveDepth: number;
  /** 最大文件大小限制（MB） */
  maxFileSize: number;
  /** 是否跳过专有名词翻译 */
  skipProperNouns: boolean;
  /** 是否跳过代码块翻译 */
  skipCodeBlocks: boolean;
  /** 专有名词配置 */
  properNouns?: {
    /** 专有名词对照表 */
    translations: Record<string, string>;
    /** 正则表达式列表 */
    patterns: string[];
    /** 是否区分大小写 */
    caseSensitive: boolean;
  };
  /** 双语对照翻译配置 */
  bilingualMode: {
    /** 是否启用双语对照模式 */
    enabled: boolean;
    /** 双语对照布局方式 */
    layout: 'parallel' | 'sequential';
    /** 原文与译文之间的分隔符 */
    separator: string;
    /** 是否在译文前显示原文 */
    showSourceFirst: boolean;
    /** 是否对齐段落 */
    alignParagraphs: boolean;
  };
}

export interface TokenUsage {
  inputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
}

export interface TranslationResult {
  sourcePath: string;
  targetPath: string;
  tokenUsage: TokenUsage;
  /** 翻译耗时（毫秒） */
  duration: number;
}

export interface LanguageMapping {
  source: LanguageCode;
  target: LanguageCode;
}

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  ar: '阿拉伯语',
  hi: '印地语',
  pt: '葡萄牙语',
  it: '意大利语',
} as const;
