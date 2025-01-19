import { MetadataTemplate, TranslationOptions, Config } from './types';

export class MetadataManager {
  private template: MetadataTemplate;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.template = config.metadataTemplate || {};
  }

  /**
   * 生成元数据内容
   */
  generate(options: TranslationOptions): string {
    if (!this.config.addMetadata) return '';

    const metadata = this.generateContent(options);
    const startMark = this.template.startMark || '<!--';
    const endMark = this.template.endMark || '-->';

    return [
      startMark,
      metadata,
      endMark,
      '',
    ].join('\n');
  }

  /**
   * 生成元数据内容
   */
  private generateContent(options: TranslationOptions): string {
    if (this.template.template) {
      return this.applyTemplate(this.template.template, options);
    }

    const lines: string[] = ['翻译元数据：'];

    // 基本信息
    lines.push(`源语言：${options.languages.source}`);
    lines.push(`目标语言：${options.languages.target}`);

    // 时间戳
    if (this.template.includeTimestamp) {
      lines.push(`翻译时间：${new Date().toISOString()}`);
    }

    // 模型信息
    if (this.template.includeModel) {
      lines.push(`使用模型：${this.config.modelName}`);
    }

    // 翻译配置
    if (this.template.includeConfig) {
      const config = {
        skipProperNouns: options.skipProperNouns,
        skipCodeBlocks: options.skipCodeBlocks,
        temperature: this.config.temperature,
      };
      lines.push(`翻译配置：${JSON.stringify(config, null, 2)}`);
    }

    // 自定义字段
    if (this.template.customFields) {
      Object.entries(this.template.customFields).forEach(([key, value]) => {
        lines.push(`${key}：${value}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 应用元数据模板
   */
  private applyTemplate(template: string, options: TranslationOptions): string {
    let content = template;

    // 替换基本变量
    content = content
      .replace('{SOURCE_LANG}', options.languages.source)
      .replace('{TARGET_LANG}', options.languages.target);

    // 替换时间戳
    if (this.template.includeTimestamp) {
      content = content.replace('{TIMESTAMP}', new Date().toISOString());
    }

    // 替换模型信息
    if (this.template.includeModel) {
      content = content.replace('{MODEL}', this.config.modelName);
    }

    // 替换配置信息
    if (this.template.includeConfig) {
      const config = {
        skipProperNouns: options.skipProperNouns,
        skipCodeBlocks: options.skipCodeBlocks,
        temperature: this.config.temperature,
      };
      content = content.replace('{CONFIG}', JSON.stringify(config, null, 2));
    }

    // 替换自定义字段
    if (this.template.customFields) {
      Object.entries(this.template.customFields).forEach(([key, value]) => {
        content = content.replace(`{${key}}`, value);
      });
    }

    return content;
  }
}
