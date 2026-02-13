/**
 * Atlas Plugin SDK
 *
 * The official SDK for building Atlas plugins.
 *
 * Provides:
 * - Type definitions for all plugin interfaces
 * - Manifest validation utilities
 * - Helper functions for common tasks
 *
 * @example
 * ```typescript
 * import { createPlugin, createWorkflowPlugin, createArtifact } from '@mhingston5/atlas-plugin-sdk';
 *
 * const myWorkflow = createWorkflowPlugin('my.workflow.v1', async (ctx, input, jobId) => {
 *   const result = await ctx.llm.generateText({ prompt: 'Hello' });
 *
 *   ctx.emitArtifact(createArtifact('my.artifact')
 *     .jobId(jobId)
 *     .title('My Result')
 *     .content(result.text)
 *     .build()
 *   );
 * });
 *
 * export default createPlugin({
 *   manifest: {
 *     id: 'com.example.my-plugin',
 *     name: 'My Plugin',
 *     version: '1.0.0',
 *     apiVersion: '1.0',
 *     entry: './dist/index.js',
 *   },
 *   workflows: [myWorkflow],
 * });
 * ```
 */

// Export all types
export type {
  Artifact,
  Command,
  ConfigSchema,
  Entity,
  Event,
  ExternalPlugin,
  Job,
  JobStatus,
  PluginConfig,
  PluginHealth,
  PluginLoadResult,
  PluginManifest,
  PluginSourceType,
  SinkContext,
  SinkPlugin,
  SourceContext,
  SourcePlugin,
  WorkflowContext,
  WorkflowPlugin,
} from "./types.js";

// Export manifest utilities
export {
  applyConfigDefaults,
  checkApiCompatibility,
  createManifest,
  getPluginInfo,
  validateConfig,
  validateManifest,
} from "./manifest.js";

// Export utility functions
export {
  chunk,
  createArtifact,
  createEntity,
  createEvent,
  createPlugin,
  createSinkPlugin,
  createSourcePlugin,
  createWorkflowPlugin,
  extractTags,
  formatDate,
  generateArtifactId,
  generateEntityId,
  generateId,
  groupBy,
  isNonEmptyString,
  isValidEmail,
  isValidUrl,
  isWithinRange,
  markdownToPlainText,
  nowIso,
  parseIso,
  retry,
  sanitizeId,
  sleep,
  truncate,
  unique,
  withTimeout,
} from "./utils.js";

// Export constants
export { CURRENT_API_VERSION, SDK_VERSION } from "./types.js";
