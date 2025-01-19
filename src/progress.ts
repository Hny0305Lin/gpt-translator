import { SingleBar, MultiBar, Presets } from 'cli-progress';
import { Config } from './types';
import chalk from 'chalk';

export class ProgressManager {
  private multibar: MultiBar | null = null;
  private bars: SingleBar[] = [];
  private enabled: boolean;
  private startTime: number = Date.now();

  constructor(config: Config) {
    this.enabled = config.showProgressBar;
    if (this.enabled) {
      this.multibar = new MultiBar({
        format: this.createProgressFormat(),
        clearOnComplete: false,
        hideCursor: true,
        fps: 10,
        barCompleteChar: '█',
        barIncompleteChar: '░',
      }, Presets.rect);
    }
  }

  /**
   * 创建进度条格式
   */
  private createProgressFormat(): string {
    return [
      '{prefix}',
      chalk.cyan('{bar}'),
      chalk.yellow('{percentage}%'),
      '|',
      chalk.blue('{task}'),
      '|',
      chalk.magenta('{speed}'),
      '|',
      chalk.gray('{status}'),
      '|',
      chalk.gray('{duration}'),
    ].join(' ');
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 格式化速度
   */
  private formatSpeed(value: number, total: number, elapsedTime: number): string {
    const speed = value / (elapsedTime / 1000);
    if (speed < 1) return '<1/s';
    return `${Math.round(speed)}/s`;
  }

  /**
   * 创建新的进度条
   */
  public createBar(task: string, total: number, prefix: string = ''): SingleBar | null {
    if (!this.enabled || !this.multibar) {
      return null;
    }

    const bar = this.multibar.create(total, 0, {
      task: task.padEnd(20),
      status: '准备中...',
      prefix: prefix ? chalk.gray(`[${prefix}]`) : '',
      speed: '0/s',
      duration: '0s',
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
      const elapsedTime = Date.now() - this.startTime;
      bar.update({
        status,
        duration: this.formatDuration(elapsedTime),
      });
    }
  }

  /**
   * 更新进度条进度
   */
  public updateProgress(bar: SingleBar | null, progress: number, status?: string): void {
    if (bar && this.enabled) {
      const elapsedTime = Date.now() - this.startTime;
      const speed = this.formatSpeed(progress, bar.getTotal(), elapsedTime);

      bar.update(progress, {
        ...(status && { status }),
        speed,
        duration: this.formatDuration(elapsedTime),
      });
    }
  }

  /**
   * 更新总进度
   */
  public updateTotalProgress(bar: SingleBar | null, completed: number, total: number): void {
    if (bar && this.enabled) {
      const progress = (completed / total) * 100;
      const elapsedTime = Date.now() - this.startTime;
      const speed = this.formatSpeed(completed, total, elapsedTime);
      const eta = this.formatDuration((total - completed) * (elapsedTime / completed));

      bar.update(progress, {
        status: `已完成 ${completed}/${total}`,
        speed,
        duration: `${this.formatDuration(elapsedTime)} (剩余: ${eta})`,
      });
    }
  }
}
