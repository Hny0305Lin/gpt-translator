import { config } from 'dotenv';
import { Config, MetadataTemplate } from './types';

// 加载 .env 文件
config();

/**
 * 通用配置解析器
 */
const parser = {
  boolean: (value: string | undefined, defaultValue = false): boolean => {
    if (!value) return defaultValue;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  },

  number: (value: string | undefined, defaultValue: number): number => {
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  },

  array: (value: string | undefined, defaultValue: string[] = []): string[] => {
    if (!value?.trim()) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  },

  keyValue: (value: string | undefined, separator = ';'): Record<string, string> => {
    if (!value?.trim()) return {};
    return value.split(separator).reduce((acc, pair) => {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);
  }
};

/**
 * 解析自定义字段
 */
function parseCustomFields(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return value.split(';').reduce((acc, field) => {
    const [key, value] = field.split('=').map(s => s.trim());
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * 解析专有名词对照表
 */
function parseTranslations(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return value.split(';').reduce((acc, pair) => {
    const [source, target] = pair.split('=').map(s => s.trim());
    if (source && target) {
      acc[source] = target;
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * 加载配置
 */
export function loadConfig(): Config {
  const env = process.env;
  const required = ['API_ENDPOINT', 'API_KEY'];

  // 验证必需的配置项
  const missing = required.filter(key => !env[key]);
  if (missing.length > 0) {
    throw new Error(`环境变量中缺少以下必需配置：${missing.join(', ')}`);
  }

  // 默认的系统提示词模板
  const defaultSystemPromptTemplate = [
    '你是一个专业的翻译专家，负责将{SOURCE_LANG}翻译成{TARGET_LANG}。',
    '你需要确保翻译结果符合目标语言的语言习惯，',
    '你可以调整语气和风格，并考虑到某些词语的文化内涵和地区差异。',
    '作为翻译家，需将原文翻译成具有信达雅标准的译文：',
    '"信"即忠实于原文的内容与意图；',
    '"达"意味着译文应通顺易懂，表达清晰；',
    '"雅"则追求译文的文化审美和语言的优美。',
    '目标是创作出既忠于原作精神，又符合目标语言文化和读者审美的翻译。',
    '{SKIP_PROPER_NOUNS}',
    '{SKIP_CODE_BLOCKS}',
    '请保持原文的格式和标点符号。',
    '{BILINGUAL_MODE}',
  ].join('\n');

  // 构建元数据模板配置
  const metadataTemplate: MetadataTemplate = {
    startMark: env.METADATA_START_MARK || '<!--',
    endMark: env.METADATA_END_MARK || '-->',
    template: env.METADATA_TEMPLATE || '翻译元数据：\n源语言：{SOURCE_LANG}\n目标语言：{TARGET_LANG}\n翻译时间：{TIMESTAMP}\n使用模型：{MODEL}',
    includeTimestamp: parser.boolean(env.METADATA_INCLUDE_TIMESTAMP, true),
    includeModel: parser.boolean(env.METADATA_INCLUDE_MODEL, true),
    includeConfig: parser.boolean(env.METADATA_INCLUDE_CONFIG, true),
    customFields: parser.keyValue(env.METADATA_CUSTOM_FIELDS),
  };

  return {
    // API 设置
    apiEndpoint: env.API_ENDPOINT!,
    apiKey: env.API_KEY!,
    modelName: env.MODEL_NAME || 'gpt-3.5-turbo',

    // 翻译设置
    maxConcurrentTranslations: parser.number(env.MAX_CONCURRENT_TRANSLATIONS, 3),
    retryCount: parser.number(env.RETRY_COUNT, 3),
    retryDelay: parser.number(env.RETRY_DELAY, 1000),
    maxRetryDelay: parser.number(env.MAX_RETRY_DELAY, 30000),
    temperature: parser.number(env.TEMPERATURE, 0.3),

    // 价格设置
    defaultInputPricePerMillionTokens: parser.number(env.DEFAULT_INPUT_PRICE, 0.2),
    defaultOutputPricePerMillionTokens: parser.number(env.DEFAULT_OUTPUT_PRICE, 0.2),

    // 文件设置
    supportedExtensions: parser.array(env.SUPPORTED_EXTENSIONS, [
      '.txt', '.md', '.mdx', '.json', '.yaml', '.yml', '.html', '.htm', '.xml', '.csv'
    ]),
    recursiveTranslation: parser.boolean(env.RECURSIVE_TRANSLATION),
    maxRecursiveDepth: parser.number(env.MAX_RECURSIVE_DEPTH, 0),
    autoRename: parser.boolean(env.AUTO_RENAME, true),
    ignoreEmptyFiles: parser.boolean(env.IGNORE_EMPTY_FILES, true),
    openOutputDir: parser.boolean(env.OPEN_OUTPUT_DIR),
    maxFileSize: parser.number(env.MAX_FILE_SIZE, 10),

    // 内容设置
    keepOriginalContent: parser.boolean(env.KEEP_ORIGINAL_CONTENT),
    contentSeparator: env.CONTENT_SEPARATOR || '\n\n---\n\n',
    addMetadata: parser.boolean(env.ADD_METADATA, true),
    autoDetectLanguage: parser.boolean(env.AUTO_DETECT_LANGUAGE),
    skipProperNouns: parser.boolean(env.SKIP_PROPER_NOUNS),
    properNouns: {
      translations: parser.keyValue(env.PROPER_NOUNS_TRANSLATIONS),
      patterns: parser.array(env.PROPER_NOUNS_PATTERNS),
      caseSensitive: parser.boolean(env.PROPER_NOUNS_CASE_SENSITIVE, true),
    },
    skipCodeBlocks: parser.boolean(env.SKIP_CODE_BLOCKS),

    // 双语对照设置
    bilingualMode: {
      enabled: parser.boolean(env.BILINGUAL_MODE, false),
      layout: (env.BILINGUAL_LAYOUT || 'parallel') as 'parallel' | 'sequential',
      separator: env.BILINGUAL_SEPARATOR || '\n---\n',
      showSourceFirst: parser.boolean(env.SHOW_SOURCE_FIRST, true),
      alignParagraphs: parser.boolean(env.ALIGN_PARAGRAPHS, true),
    },

    // 元数据设置
    metadataTemplate,

    // 进度和报告设置
    showProgressBar: parser.boolean(env.SHOW_PROGRESS_BAR, true),
    generateReport: parser.boolean(env.GENERATE_REPORT, true),
    reportFormat: (env.REPORT_FORMAT || 'markdown') as 'json' | 'markdown' | 'text',

    // 系统提示词
    systemPromptTemplate: env.SYSTEM_PROMPT_TEMPLATE || defaultSystemPromptTemplate,
  };
}
