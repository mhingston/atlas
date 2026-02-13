/**
 * Filesystem Source Plugin
 *
 * Watches directories and ingests markdown/text files into Atlas.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  type SourceContext,
  createEntity,
  createSourcePlugin,
  extractTags,
} from "@mhingston5/atlas-plugin-sdk";

interface FileInfo {
  path: string;
  relativePath: string;
  content: string;
  stats: {
    size: number;
    mtime: Date;
    birthtime: Date;
  };
}

interface Config {
  watchPaths: string[];
  includePatterns: string[];
  excludePatterns: string[];
  defaultTags: string[];
}

/**
 * Check if a file matches glob-like patterns
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching - convert ** to .*, * to [^/]*
    const regex = new RegExp(
      pattern
        .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
        .replace(/\*/g, "[^/]*")
        .replace(/<<<DOUBLESTAR>>>/g, ".*")
        .replace(/\?/g, "."),
    );
    if (regex.test(filePath)) return true;
  }
  return false;
}

/**
 * Check if file should be excluded
 */
function shouldExclude(filePath: string, excludePatterns: string[]): boolean {
  return matchesPatterns(filePath, excludePatterns);
}

/**
 * Check if file should be included
 */
function shouldInclude(filePath: string, includePatterns: string[]): boolean {
  return matchesPatterns(filePath, includePatterns);
}

/**
 * Recursively scan directory for matching files
 */
function scanDirectory(
  dir: string,
  baseDir: string,
  includePatterns: string[],
  excludePatterns: string[],
): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(baseDir, fullPath);

      if (shouldExclude(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(
          ...scanDirectory(fullPath, baseDir, includePatterns, excludePatterns),
        );
      } else if (
        entry.isFile() &&
        shouldInclude(relativePath, includePatterns)
      ) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err);
  }

  return files;
}

/**
 * Read and parse a file
 */
function readFile(filePath: string, baseDir: string): FileInfo | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const stats = statSync(filePath);

    return {
      path: filePath,
      relativePath: relative(baseDir, filePath),
      content,
      stats: {
        size: stats.size,
        mtime: stats.mtime,
        birthtime: stats.birthtime,
      },
    };
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    return null;
  }
}

/**
 * Extract title from markdown content
 */
function extractTitle(content: string, filename: string): string {
  // Look for # Title in markdown
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Use filename without extension
  return basename(filename, extname(filename));
}

/**
 * Generate entity ID from file path
 */
function generateEntityIdFromPath(filePath: string): string {
  // Sanitize path for use as ID
  const sanitized = filePath
    .replace(/[^a-zA-Z0-9-_/]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `fs:${sanitized}`;
}

/**
 * Get file extension for type detection
 */
function getFileType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".mdx":
      return "markdown";
    case ".txt":
      return "text";
    default:
      return "unknown";
  }
}

/**
 * Create the filesystem source plugin
 */
export function createFilesystemSource(config: Config) {
  return createSourcePlugin(
    "atlas.filesystem-source",
    async (ctx: SourceContext) => {
      const files: FileInfo[] = [];

      // Scan all watch paths
      for (const watchPath of config.watchPaths) {
        const resolvedPath = resolve(watchPath);

        try {
          const stat = statSync(resolvedPath);

          if (stat.isDirectory()) {
            // Scan directory recursively
            const filePaths = scanDirectory(
              resolvedPath,
              resolvedPath,
              config.includePatterns,
              config.excludePatterns,
            );

            for (const filePath of filePaths) {
              const fileInfo = readFile(filePath, resolvedPath);
              if (fileInfo) files.push(fileInfo);
            }
          } else if (stat.isFile()) {
            // Single file
            const fileInfo = readFile(resolvedPath, resolvedPath);
            if (fileInfo) files.push(fileInfo);
          }
        } catch (err) {
          console.error(`Error accessing path ${resolvedPath}:`, err);
        }
      }

      // Create entities for each file
      for (const file of files) {
        const title = extractTitle(file.content, file.path);
        const fileType = getFileType(file.path);
        const tags = extractTags(file.content);

        // Merge default tags with extracted tags
        const allTags = [...new Set([...config.defaultTags, ...tags])];

        const entity = createEntity(
          "atlas.filesystem-source",
          "filesystem.document",
          generateEntityIdFromPath(file.relativePath),
          {
            title,
            content: file.content,
            file_path: file.path,
            relative_path: file.relativePath,
            file_type: fileType,
            file_size: file.stats.size,
            modified_at: file.stats.mtime.toISOString(),
            created_at: file.stats.birthtime.toISOString(),
            tags: allTags,
            word_count: file.content.split(/\s+/).length,
            line_count: file.content.split("\n").length,
          },
        );

        // Upsert entity into Atlas
        ctx.commands.enqueue({
          type: "entity.upsert",
          entity,
        });
      }

      console.log(`Filesystem source synced ${files.length} files`);
    },
  );
}
