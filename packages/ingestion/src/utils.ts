export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitAtTokenBoundary(
  text: string,
  maxTokens: number,
): string[] {
  if (maxTokens <= 0) throw new Error("maxTokens must be > 0");
  const maxChars = maxTokens * 4;
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf(" ", maxChars);
    const splitAt = boundary > 0 ? boundary : maxChars;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}
