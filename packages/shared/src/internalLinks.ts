import type { InternalLink, InternalLinkKind } from "./types";

const supportedKinds = new Set<InternalLinkKind>([
  "Task",
  "Note",
  "Concept",
  "File",
  "GDD",
  "Snippet",
  "Bug",
  "Milestone"
]);

const internalLinkPattern = /\[\[([A-Za-z]+):\s*([^\]]+?)\]\]/g;

export function parseInternalLinks(markdown: string): InternalLink[] {
  const links: InternalLink[] = [];
  for (const match of markdown.matchAll(internalLinkPattern)) {
    const rawKind = match[1] ?? "";
    const target = (match[2] ?? "").trim();
    const kind = normalizeKind(rawKind);
    if (!kind || !target) {
      continue;
    }

    links.push({
      raw: match[0],
      kind,
      target,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length
    });
  }

  return links;
}

export function normalizeKind(value: string): InternalLinkKind | null {
  const normalized = value.trim().toLowerCase();
  const kind = Array.from(supportedKinds).find((candidate) => candidate.toLowerCase() === normalized);
  return kind ?? null;
}

export function buildInternalLink(kind: InternalLinkKind, target: string): string {
  return `[[${kind}: ${target.trim()}]]`;
}
