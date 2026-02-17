/**
 * ISC Definitions Index
 *
 * Exports all ISC definitions for artifact types.
 */

export { summaryNoteISC } from "./summary-note";
export { brainstormSessionISC } from "./brainstorm-session";
export { digestWeeklyISC } from "./digest-weekly";

import { globalISCRegistry } from "../registry";
import { brainstormSessionISC } from "./brainstorm-session";
import { digestWeeklyISC } from "./digest-weekly";
import { summaryNoteISC } from "./summary-note";

export function registerDefaultISCDefinitions(): void {
  globalISCRegistry.register(summaryNoteISC.artifactType, summaryNoteISC);
  globalISCRegistry.register(
    brainstormSessionISC.artifactType,
    brainstormSessionISC,
  );
  globalISCRegistry.register(digestWeeklyISC.artifactType, digestWeeklyISC);
}
