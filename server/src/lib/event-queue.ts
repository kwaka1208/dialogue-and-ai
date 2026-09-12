/**
 * push された値を、await で1件ずつ取り出せるキュー。
 * SSEのハンドラが「次のイベントが来るまで待つ」ために使う。
 */
export class EventQueue<T> {
  private readonly buffer: T[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    this.buffer.push(value);
    this.wake?.();
    this.wake = null;
  }

  close(): void {
    this.closed = true;
    this.wake?.();
    this.wake = null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      while (this.buffer.length > 0) {
        yield this.buffer.shift()!;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}
