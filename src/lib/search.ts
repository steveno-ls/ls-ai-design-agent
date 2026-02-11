// src/lib/search.ts
import Fuse from "fuse.js";
import { tokenizeQuery, pickBest, scoreLabel } from "@/lib/figmaSearch";
import { getFigmaLiveIndex } from "@/lib/figmaIndex";

function pickTopPages(index: any[], query: string, maxPages = 3) {
  const tokens = tokenizeQuery(query);

  const pages = Array.from(new Set(index.map((i) => i.page).filter(Boolean)));

  const scoredPages = pages
    .map((p) => ({ p, score: scoreLabel(tokens, p) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, maxPages)
    .map((x) => x.p);

  return scoredPages;
}

export async function getLiveIndex(fileKey?: string) {
  const index = await getFigmaLiveIndex(fileKey);
  console.log(`🔍 Loaded ${index.length} components from Figma`);
  return index;
}

export async function findBestComponent(query: string, fileKey?: string) {
  const index = await getLiveIndex(fileKey);
  if (!index?.length) return null;

  const q = (query || "").trim();
  if (!q) return null;

  const topPages = pickTopPages(index, q, 3);
  const scoped = topPages.length
    ? index.filter((i) => topPages.includes(i.page))
    : index;

  const fuse = new Fuse(scoped, {
    keys: ["name", "normalized", "page", "frame", "path"],
    threshold: 0.55,
    ignoreLocation: true,
  });

  const pool = fuse.search(q.toLowerCase(), { limit: 50 }).map((r) => r.item);
  if (!pool.length) return null;

  const tokens = tokenizeQuery(q);

  const scored = pool
    .map((item: any) => {
      const label = `${item.page || ""} ${item.frame || ""} ${item.name || ""} ${item.path || ""}`;
      return { item, score: scoreLabel(tokens, label) };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].item : pool[0];
}

export async function listCloseComponents(
  query: string,
  limit = 3,
  fileKey?: string,
) {
  const index = await getLiveIndex(fileKey);
  if (!index?.length) return [];

  const q = (query || "").trim();
  if (!q) return [];

  const topPages = pickTopPages(index, q, 3);
  const scoped = topPages.length
    ? index.filter((i) => topPages.includes(i.page))
    : index;

  const fuse = new Fuse(scoped, {
    keys: ["name", "normalized", "page", "frame", "path"],
    threshold: 0.6,
    ignoreLocation: true,
  });

  const pool = fuse.search(q.toLowerCase(), { limit: 50 }).map((r) => r.item);
  const tokens = tokenizeQuery(q);

  return pool
    .map((item: any) => {
      const label = `${item.page || ""} ${item.frame || ""} ${item.name || ""} ${item.path || ""}`;
      return { item, score: scoreLabel(tokens, label) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, limit);
}

export function explainToken(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("color") || lower.includes("colour")) {
    return {
      group: "color",
      token: {
        name: "color.brand.primary",
        value: "#1E90FF",
        description: "Primary brand blue used for main CTAs.",
      },
    };
  }
  if (lower.includes("spacing") || lower.includes("space")) {
    return {
      group: "spacing",
      token: { name: "spacing.base", value: 8 },
    };
  }
  if (lower.includes("typography") || lower.includes("font")) {
    return {
      group: "typography",
      token: {
        name: "type.body.md",
        value: { font: "Inter", size: 16, lineHeight: 24 },
      },
    };
  }
  return null;
}

type IndexedComponent = {
  id: string;
  name: string;
  description?: string;
  fileKey: string;
  page: string;
  frame: string;
  path?: string;
  figmaUrl?: string;
  imageUrl?: string;
};

export function pickBestComponentPageFirst(
  query: string,
  components: IndexedComponent[],
  maxPages = 3,
  maxCandidates = 50,
) {
  const tokens = tokenizeQuery(query);

  const uniquePages = Array.from(new Set(components.map((c) => c.page)));
  const pageRank = pickBest(tokens, uniquePages, (p) => p);

  const topPages = pageRank.scored
    .filter((p) => p.score > 0)
    .slice(0, maxPages)
    .map((p) => p.item);

  const inScope = topPages.length
    ? components.filter((c) => topPages.includes(c.page))
    : components;

  const scored = inScope
    .map((c) => {
      const label = `${c.page} ${c.frame} ${c.name} ${c.path || ""}`;
      return { c, label };
    })
    .map(({ c, label }) => ({
      ...c,
      _score: pickBest(tokens, [label], (x) => x).scored[0]?.score || 0,
    }))
    .sort((a, b) => (b._score || 0) - (a._score || 0))
    .slice(0, maxCandidates);

  const best = scored[0] && scored[0]._score > 0 ? scored[0] : null;

  return {
    best,
    candidates: scored,
    debug: { topPages, tokens },
  };
}
