# GPT Translator

基于 LLM 的多语言文件翻译工具，支持多种语言之间的互译，具有专有名词保护、代码块保护等特性。

推荐使用 DeepSeek V3. 温度建议设置为 1.3

## 主要特性

- 🌍 支持多语言互译
  - 支持中文、英语、日语、韩语等多种语言
  - 支持自动检测源语言
  - 支持批量翻译整个目录

- 🛡️ 专有名词保护
  - 支持专有名词对照表
  - 支持正则表达式匹配
  - 支持区分大小写

- 💻 代码友好
  - 保护代码块不被翻译
  - 保持 Markdown、HTML 等格式
  - 支持多种文件类型

- 🚀 高效处理
  - 支持并发翻译
  - 支持递归处理子目录
  - 自动重试机制

- 📊 进度和报告
  - 实时显示翻译进度
  - 支持生成翻译报告
  - 提供成本估算

## 安装

```bash
# 克隆项目
git clone https://github.com/MiraHikari/gpt-translator.git
cd gpt-translator

# 安装依赖
pnpm install

# 构建项目
pnpm build
```

## 快速开始

1. 创建配置文件 `.env`：

```env
# 从 .env.example 复制并修改配置
cp .env.example .env

# 必需的配置项
API_ENDPOINT=https://api.openai.com/v1
API_KEY=your-api-key
MODEL_NAME=gpt-3.5-turbo
```

2. 基本使用：

```bash
# 显示支持的语言列表
pnpm start --list-languages

# 翻译单个文件
pnpm start -i input.md -o output.md -l zh-en

# 翻译整个目录（递归）
pnpm start -i ./docs -o ./docs-en -l zh-en --recursive

# 自动检测源语言
pnpm start -i input.md -o output.md --auto-detect -l en
```

## 示例用法

1. 基础翻译：
```bash
# 中文翻译为英文
pnpm start -i README.md -o README.en.md -l zh-en

# 英文翻译为中文
pnpm start -i docs/guide.md -o docs/guide.zh.md -l en-zh
```

2. 高级功能：
```bash
# 递归翻译目录，保护专有名词，生成报告
pnpm start -i ./docs -o ./docs-en -l zh-en \
  --recursive \
  --skip-proper-nouns \
  --report markdown

# 自动检测语言，保留原文，显示进度
pnpm start -i input.txt -o output.txt \
  --auto-detect \
  --keep-original \

# 并发翻译，自动重命名，限制文件大小
pnpm start -i ./source -o ./target -l en-zh \
  -n 5 \
  --auto-rename \
  --max-file-size 5
```

3. 批量处理：
```bash
# 递归翻译整个文档目录，跳过代码块
pnpm start -i ./docs -o ./docs-translated -l zh-en \
  --recursive \
  --skip-code-blocks \
  --max-depth 3

# 处理大型项目，调整并发和重试
pnpm start -i ./project -o ./project-translated -l en-zh \
  --recursive \
  --concurrency 10 \
  --retry-count 5 \
  --retry-delay 2000
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发构建
pnpm dev

# 生产构建
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

## 注意事项

1. API 密钥安全：
   - 不要在代码中硬编码 API 密钥
   - 使用环境变量或配置文件管理密钥
   - 确保 `.env` 文件不被提交到版本控制

2. 成本控制：
   - 使用 `--auto-detect` 时会额外消耗 token
   - 合理设置并发数和重试次数
   - 注意大文件的处理
   - 使用 `estimateUsage` 预估成本

3. 文件处理：
   - 建议先备份重要文件
   - 使用 `--auto-rename` 避免覆盖已有文件
   - 注意文件大小限制
   - 检查输出目录的写入权限

4. 性能优化：
   - 合理设置 `MAX_CONCURRENT_TRANSLATIONS`
   - 对大型目录使用 `--max-depth` 限制递归深度
   - 使用 `--ignore-empty` 跳过空文件

## License

MIT
