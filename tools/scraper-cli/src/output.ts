import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedBlock, ExportOptions } from "./types.js";

export function formatAsIgPosts(blocks: ParsedBlock[]): string {
  return blocks.map((b) => b.content).join("\n---\n");
}

export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function exportBlocks(
  blocks: ParsedBlock[],
  options: ExportOptions,
): Promise<string[]> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const groupedByTitle = blocks.reduce<Record<string, ParsedBlock[]>>(
    (acc, block) => {
      const key = block.title;
      return { ...acc, [key]: [...(acc[key] ?? []), block] };
    },
    {},
  );

  const writtenFiles: string[] = [];

  for (const [title, titleBlocks] of Object.entries(groupedByTitle)) {
    const filename = `${sanitizeFilename(title)}.txt`;
    const filepath = path.join(options.outputDir, filename);
    await fs.writeFile(filepath, formatAsIgPosts(titleBlocks), "utf-8");
    writtenFiles.push(filepath);
    process.stdout.write(
      `  wrote: ${filepath} (${titleBlocks.length} blocks)\n`,
    );
  }

  return writtenFiles;
}

export async function exportCombined(
  blocks: ParsedBlock[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, formatAsIgPosts(blocks), "utf-8");
  process.stdout.write(
    `  wrote combined: ${outputPath} (${blocks.length} total blocks)\n`,
  );
}
