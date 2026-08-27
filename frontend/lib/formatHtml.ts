const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function looksPrettyPrinted(html: string): boolean {
  const lines = html.split("\n");
  if (lines.length < 8) return false;
  return lines.some((line) => /^\s{2,}</.test(line));
}

/** Turn minified HTML into indented, line-broken markup for code views. */
export function formatHtml(html: string): string {
  const source = html.trim();
  if (!source) return source;
  if (looksPrettyPrinted(source)) return source;

  const lines: string[] = [];
  let depth = 0;
  const parts = source.replace(/>\s+</g, "><").replace(/></g, ">\n<").split("\n");

  for (const part of parts) {
    const line = part.trim();
    if (!line) continue;

    const closingMatch = line.match(/^<\/([\w:-]+)/);
    const openMatch = line.match(/^<([\w:-]+)/);
    const tagName = (closingMatch?.[1] || openMatch?.[1] || "").toLowerCase();

    const isClosing = Boolean(closingMatch);
    const isSelfClosing =
      /\/>$/.test(line) ||
      (VOID_ELEMENTS.has(tagName) && !isClosing) ||
      /^<(!|!DOCTYPE|\?)/i.test(line);

    if (isClosing) depth = Math.max(0, depth - 1);

    lines.push(`${"  ".repeat(depth)}${line}`);

    const isOpening =
      Boolean(openMatch) &&
      !isClosing &&
      !isSelfClosing &&
      !line.includes("</");

    if (isOpening) depth += 1;
  }

  return lines.join("\n");
}
