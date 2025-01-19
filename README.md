# GPT Translator

基于 GPT 的多语言文件翻译工具，支持批量翻译、双语对照、专有名词处理等功能。

推荐使用 DeepSeek V3, GPT-4o, Claude 3.5 Sonnet 等模型。

** 注意: AI 生成内容可能存在错误，请自行检查翻译结果 **

## 特性

- 支持多种语言之间的互译
- 支持批量翻译文件和目录
- 支持双语对照翻译（并行/顺序布局）
- 支持专有名词保护和自定义翻译
- 支持代码块保护
- 支持递归翻译子目录
- 支持进度显示和翻译报告
- 支持自动语言检测
- 支持自定义分隔符和元数据
- 支持流式输出，实时显示翻译进度

## 安装和构建

```bash
# 克隆项目
git clone https://github.com/yourusername/gpt-translator.git
cd gpt-translator

# 安装依赖
pnpm install

# 构建项目
pnpm build

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置必要的配置项（如 API_KEY 等）
```

## 使用方法

### 基本用法

```bash
# 显示支持的语言列表
pnpm start --list-languages

# 翻译单个文件
pnpm start -i input.md -o output.md -l zh-en

# 翻译整个目录
pnpm start -i ./docs -o ./docs-en -l zh-en --recursive
```

### 双语对照翻译

```bash
# 启用双语对照（默认并行布局）
pnpm start -i input.md -o output.md -l zh-en --bilingual

# 使用顺序布局
pnpm start -i input.md -o output.md -l zh-en --bilingual --bilingual-layout sequential

# 原文在前显示
pnpm start -i input.md -o output.md -l zh-en --bilingual --source-first

# 自定义分隔符
pnpm start -i input.md -o output.md -l zh-en --bilingual --bilingual-separator "\n\n===\n\n"

# 启用段落对齐
pnpm start -i input.md -o output.md -l zh-en --bilingual --align-paragraphs
```

### 专有名词处理

```bash
# 保持专有名词不变
pnpm start -i input.md -o output.md -l zh-en --skip-proper-nouns

# 使用自定义专有名词对照表（在 .env 文件中配置）
PROPER_NOUNS_TRANSLATIONS=GPT=GPT;AI=AI
```

### 其他功能

```bash
# 自动检测源语言
pnpm start -i input.md -o output.md --auto-detect -l en

# 保留原文
pnpm start -i input.md -o output.md -l zh-en --keep-original

# 生成翻译报告
pnpm start -i input.md -o output.md -l zh-en --report

# 显示支持的语言列表
pnpm start --list-languages
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式构建（带监视）
pnpm dev

# 生产构建
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

## 配置说明

支持通过命令行参数或 `.env` 文件进行配置，主要配置项包括：

### API 设置
- `API_ENDPOINT`: API 端点
- `API_KEY`: API 密钥
- `MODEL_NAME`: 模型名称

### 翻译设置
- `MAX_CONCURRENT_TRANSLATIONS`: 最大并发翻译数量
- `RETRY_COUNT`: 重试次数
- `RETRY_DELAY`: 重试延迟（毫秒）
- `TEMPERATURE`: 温度参数 (0-1)

### 双语对照设置
- `BILINGUAL_MODE`: 是否启用双语对照
- `BILINGUAL_LAYOUT`: 布局方式 (parallel/sequential)
- `BILINGUAL_SEPARATOR`: 原文与译文之间的分隔符
- `SHOW_SOURCE_FIRST`: 是否在译文前显示原文
- `ALIGN_PARAGRAPHS`: 是否对齐段落

### 专有名词设置
- `SKIP_PROPER_NOUNS`: 是否跳过专有名词翻译
- `PROPER_NOUNS_TRANSLATIONS`: 专有名词对照表
- `PROPER_NOUNS_PATTERNS`: 专有名词匹配模式
- `PROPER_NOUNS_CASE_SENSITIVE`: 是否区分大小写

### 文件设置
- `SUPPORTED_EXTENSIONS`: 支持的文件扩展名
- `RECURSIVE_TRANSLATION`: 是否递归翻译子目录
- `MAX_RECURSIVE_DEPTH`: 最大递归深度
- `AUTO_RENAME`: 是否自动重命名输出文件
- `IGNORE_EMPTY_FILES`: 是否忽略空文件
- `MAX_FILE_SIZE`: 最大文件大小限制（MB）

### 内容设置
- `KEEP_ORIGINAL_CONTENT`: 是否保留原文
- `CONTENT_SEPARATOR`: 原文与译文之间的分隔符
- `ADD_METADATA`: 是否添加元数据
- `AUTO_DETECT_LANGUAGE`: 是否自动检测语言
- `SKIP_CODE_BLOCKS`: 是否跳过代码块翻译

### 进度和报告设置
- `SHOW_PROGRESS_BAR`: 是否显示进度条
- `GENERATE_REPORT`: 是否生成报告
- `REPORT_FORMAT`: 报告格式 (json/markdown/text)

## 注意事项

1. API 密钥安全：
   - 不要在代码中硬编码 API 密钥
   - 使用环境变量或配置文件管理密钥
   - 确保 `.env` 文件不被提交到版本控制

2. 成本控制：
   - 使用 `--auto-detect` 时会额外消耗 token
   - 合理设置并发数和重试次数
   - 注意大文件的处理
   - 可以先使用较小的文件测试

3. 文件处理：
   - 建议先备份重要文件
   - 使用 `--auto-rename` 避免覆盖已有文件
   - 注意文件大小限制
   - 检查输出目录的写入权限

## 输出示例

### 双语对照（并行布局）
```markdown
这是一个示例文本。
This is a sample text.

这是第二段。
This is the second paragraph.
```

### 双语对照（顺序布局）
```markdown
这是一个示例文本。
这是第二段。

---

This is a sample text.
This is the second paragraph.
```

## 许可证

MIT
