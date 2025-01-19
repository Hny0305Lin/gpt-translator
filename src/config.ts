import { config } from 'dotenv';
import { Config, MetadataTemplate } from './types';

// 加载 .env 文件
config();

/**
 * 解析布尔值
 */
function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

/**
 * 解析数组
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim());
}

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
  const {
    // API 设置
    API_ENDPOINT,
    API_KEY,
    MODEL_NAME = 'gpt-3.5-turbo',

    // 翻译设置
    MAX_CONCURRENT_TRANSLATIONS = '3',
    RETRY_COUNT = '3',
    RETRY_DELAY = '1000',
    MAX_RETRY_DELAY = '30000',
    TEMPERATURE = '0.3',

    // 价格设置
    DEFAULT_INPUT_PRICE = '0.2',
    DEFAULT_OUTPUT_PRICE = '0.2',

    // 文件设置
    SUPPORTED_EXTENSIONS,
    RECURSIVE_TRANSLATION = 'false',
    MAX_RECURSIVE_DEPTH = '0',
    AUTO_RENAME = 'true',
    IGNORE_EMPTY_FILES = 'true',
    OPEN_OUTPUT_DIR = 'false',
    MAX_FILE_SIZE = '10',

    // 内容设置
    KEEP_ORIGINAL_CONTENT = 'false',
    CONTENT_SEPARATOR = '\n\n---\n\n',
    ADD_METADATA = 'true',
    AUTO_DETECT_LANGUAGE = 'false',
    SKIP_PROPER_NOUNS = 'false',
    PROPER_NOUNS_TRANSLATIONS = '',
    PROPER_NOUNS_PATTERNS = '',
    PROPER_NOUNS_CASE_SENSITIVE = 'true',
    SKIP_CODE_BLOCKS = 'false',

    // 元数据设置
    METADATA_START_MARK = '<!--',
    METADATA_END_MARK = '-->',
    METADATA_TEMPLATE,
    METADATA_INCLUDE_TIMESTAMP = 'true',
    METADATA_INCLUDE_MODEL = 'true',
    METADATA_INCLUDE_CONFIG = 'true',
    METADATA_CUSTOM_FIELDS,

    // 进度和报告设置
    SHOW_PROGRESS_BAR = 'true',
    GENERATE_REPORT = 'true',
    REPORT_FORMAT = 'markdown',

    // 系统提示词
    SYSTEM_PROMPT_TEMPLATE,
  } = process.env;

  // 验证必需的配置项
  if (!API_ENDPOINT) {
    throw new Error('环境变量中缺少 API_ENDPOINT 配置');
  }

  if (!API_KEY) {
    throw new Error('环境变量中缺少 API_KEY 配置');
  }

  // 构建元数据模板配置
  const metadataTemplate: MetadataTemplate = {
    startMark: METADATA_START_MARK,
    endMark: METADATA_END_MARK,
    template: METADATA_TEMPLATE || '翻译元数据：\n源语言：{SOURCE_LANG}\n目标语言：{TARGET_LANG}\n翻译时间：{TIMESTAMP}\n使用模型：{MODEL}',
    includeTimestamp: parseBoolean(METADATA_INCLUDE_TIMESTAMP),
    includeModel: parseBoolean(METADATA_INCLUDE_MODEL),
    includeConfig: parseBoolean(METADATA_INCLUDE_CONFIG),
    customFields: parseCustomFields(METADATA_CUSTOM_FIELDS),
  };

  // 构建默认的系统提示词模板
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
  ].join('\n');

  return {
    // API 设置
    apiEndpoint: API_ENDPOINT,
    apiKey: API_KEY,
    modelName: MODEL_NAME,

    // 翻译设置
    maxConcurrentTranslations: parseInt(MAX_CONCURRENT_TRANSLATIONS, 10),
    retryCount: parseInt(RETRY_COUNT, 10),
    retryDelay: parseInt(RETRY_DELAY, 10),
    maxRetryDelay: parseInt(MAX_RETRY_DELAY, 10),
    temperature: parseFloat(TEMPERATURE),

    // 价格设置
    defaultInputPricePerMillionTokens: parseFloat(DEFAULT_INPUT_PRICE),
    defaultOutputPricePerMillionTokens: parseFloat(DEFAULT_OUTPUT_PRICE),

    // 文件设置
    supportedExtensions: parseArray(SUPPORTED_EXTENSIONS, [
      '.txt', '.md', '.mdx', '.json', '.yaml', '.yml', '.html', '.htm', '.xml', '.csv'
    ]),
    recursiveTranslation: parseBoolean(RECURSIVE_TRANSLATION),
    maxRecursiveDepth: parseInt(MAX_RECURSIVE_DEPTH, 10),
    autoRename: parseBoolean(AUTO_RENAME),
    ignoreEmptyFiles: parseBoolean(IGNORE_EMPTY_FILES),
    openOutputDir: parseBoolean(OPEN_OUTPUT_DIR),
    maxFileSize: parseInt(MAX_FILE_SIZE, 10),

    // 内容设置
    keepOriginalContent: parseBoolean(KEEP_ORIGINAL_CONTENT),
    contentSeparator: CONTENT_SEPARATOR,
    addMetadata: parseBoolean(ADD_METADATA),
    autoDetectLanguage: parseBoolean(AUTO_DETECT_LANGUAGE),
    skipProperNouns: parseBoolean(SKIP_PROPER_NOUNS),
    properNouns: {
      translations: parseTranslations(PROPER_NOUNS_TRANSLATIONS),
      patterns: parseArray(PROPER_NOUNS_PATTERNS),
      caseSensitive: parseBoolean(PROPER_NOUNS_CASE_SENSITIVE),
    },
    skipCodeBlocks: parseBoolean(SKIP_CODE_BLOCKS),

    // 元数据设置
    metadataTemplate,

    // 进度和报告设置
    showProgressBar: parseBoolean(SHOW_PROGRESS_BAR),
    generateReport: parseBoolean(GENERATE_REPORT),
    reportFormat: (REPORT_FORMAT || 'markdown') as 'json' | 'markdown' | 'text',

    // 系统提示词
    systemPromptTemplate: SYSTEM_PROMPT_TEMPLATE || defaultSystemPromptTemplate,
  };
}
