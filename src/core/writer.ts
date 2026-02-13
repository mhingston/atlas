import type { Database } from "bun:sqlite";
import { applyCommand } from "./apply";
import type { Command } from "./commands";

export class Writer {
  constructor(private db: Database) {}

  applyBatch(cmds: Command[]) {
    if (cmds.length === 0) return;

    const tx = this.db.transaction((cmds2: Command[]) => {
      for (const c of cmds2) {
        applyCommand(this.db, c);
      }
    });

    tx(cmds);
  }
}
