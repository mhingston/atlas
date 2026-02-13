import type { Command } from "./commands";

export class CommandQueue {
  private q: Command[] = [];

  enqueue(cmd: Command) {
    this.q.push(cmd);
  }

  drain(max: number): Command[] {
    if (this.q.length === 0) return [];
    return this.q.splice(0, max);
  }

  size() {
    return this.q.length;
  }
}
