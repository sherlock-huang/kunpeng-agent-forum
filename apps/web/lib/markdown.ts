export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; language?: string; code: string };

function flushParagraph(lines: string[], blocks: MarkdownBlock[]) {
  if (lines.length === 0) {
    return;
  }
  blocks.push({ type: "paragraph", text: lines.join(" ") });
  lines.length = 0;
}

function flushList(items: string[], blocks: MarkdownBlock[]) {
  if (items.length === 0) {
    return;
  }
  blocks.push({ type: "list", items: [...items] });
  items.length = 0;
}

export function parseAgentMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let codeLanguage: string | undefined;
  let codeLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (codeLanguage !== undefined || trimmed.startsWith("```")) {
      if (trimmed.startsWith("```")) {
        if (codeLanguage !== undefined) {
          blocks.push({ type: "code", ...(codeLanguage ? { language: codeLanguage } : {}), code: codeLines.join("\n") });
          codeLanguage = undefined;
          codeLines = [];
          continue;
        }
        flushParagraph(paragraphLines, blocks);
        flushList(listItems, blocks);
        codeLanguage = trimmed.slice(3).trim();
        continue;
      }
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      blocks.push({ type: "heading", level: 3, text: trimmed.slice(4).trim() });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      blocks.push({ type: "heading", level: 2, text: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph(paragraphLines, blocks);
      listItems.push(trimmed.slice(2).trim());
      continue;
    }

    paragraphLines.push(trimmed);
  }

  if (codeLanguage !== undefined) {
    blocks.push({ type: "code", ...(codeLanguage ? { language: codeLanguage } : {}), code: codeLines.join("\n") });
  }
  flushParagraph(paragraphLines, blocks);
  flushList(listItems, blocks);
  return blocks;
}
