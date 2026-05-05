import type { Item } from "../types";

export type CodeLink = {
  name: string;
  url: string;
  stars: number;
  description?: string;
};

export function getCodeLinks(item: Item): CodeLink[] {
  const md = item.metadata as Record<string, unknown>;
  const links = md?.code_links;
  if (Array.isArray(links)) return links as CodeLink[];
  return [];
}

export function getArcaVerdict(item: Item): string | null {
  const md = item.metadata as Record<string, unknown> | undefined;
  const arca = md?.arca as { verdict?: string } | undefined;
  return arca?.verdict || null;
}
