import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * 检查路径是否存在
 */
export function pathExists(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * 确保目录存在，如果不存在则创建
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取文件夹中的所有文件路径
 */
export function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * 生成目标文件路径
 */
export function generateTargetPath(sourcePath: string, outputDir: string): string {
  const sourceBaseName = path.basename(sourcePath);
  return path.join(outputDir, sourceBaseName);
}

/**
 * 检查文件是否为空
 */
export function isEmptyFile(filePath: string): boolean {
  const stat = fs.statSync(filePath);
  return stat.size === 0;
}

/**
 * 生成唯一的文件名
 */
export function generateUniqueFileName(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  let index = 1;
  let newPath = filePath;

  while (fs.existsSync(newPath)) {
    newPath = path.join(dir, `${baseName}_${index}${ext}`);
    index++;
  }

  return newPath;
}

/**
 * 格式化日志消息
 */
export const logger = {
  info: (message: string) => console.log(chalk.blue(message)),
  success: (message: string) => console.log(chalk.green(message)),
  error: (message: string) => console.log(chalk.red(message)),
  warn: (message: string) => console.log(chalk.yellow(message)),
};
