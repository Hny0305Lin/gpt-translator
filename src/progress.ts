import { SingleBar, MultiBar, Presets } from 'cli-progress';
import { Config } from './types';
import chalk from 'chalk';

export class ProgressManager {
  private multibar: MultiBar | null = null;
  private bars: SingleBar[] = [];
  private enabled: boolean;

  constructor(config: Config) {
    this.enabled = config.showProgressBar;
    if (this.enabled) {
      this.multibar = new MultiBar({
        format: this.createProgressFormat(),
      }, Presets.rect);
    }
  }

  /**
   * 创建进度条格式
   */
  private createProgressFormat(): string {
    return [
      chalk.cyan('{bar}'),
      chalk.yellow('{percentage}%'),
      '|',
      chalk.blue('{task}'),
      '|',
      chalk.gray('{status}'),
    ].join(' ');
  }

  /**
   * 创建新的进度条
   */
  public createBar(task: string, total: number): SingleBar | null {
    if (!this.enabled || !this.multibar) {
      return null;
    }

    const bar = this.multibar.create(total, 0, {
      task: task.padEnd(20),
      status: '准备中...',
    });

    this.bars.push(bar);
    return bar;
  }

  /**
   * 停止所有进度条
   */
  public stop(): void {
    if (this.enabled && this.multibar) {
      this.multibar.stop();
      // 添加一个空行，使输出更整洁
      console.log();
    }
  }

  /**
   * 清除所有进度条
   */
  public clear(): void {
    if (this.enabled && this.multibar) {
      this.bars.forEach(bar => bar.stop());
      this.bars = [];
      this.multibar.stop();
    }
  }

  /**
   * 更新进度条状态
   */
  public updateStatus(bar: SingleBar | null, status: string): void {
    if (bar && this.enabled) {
      bar.update({ status });
    }
  }

  /**
   * 更新进度条进度
   */
  public updateProgress(bar: SingleBar | null, progress: number, status?: string): void {
    if (bar && this.enabled) {
      bar.update(progress, { ...(status && { status }) });
    }
  }
}
