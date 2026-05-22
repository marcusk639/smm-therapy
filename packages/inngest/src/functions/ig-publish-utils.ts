export function buildCaption(
  hook: string,
  caption: string,
  hashtags: string[],
): string {
  const hashtagStr =
    hashtags.length > 0 ? "\n\n" + hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${hook}\n\n${caption}${hashtagStr}`;
}
