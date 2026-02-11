// src/lib/designSystemSearch.ts
import Fuse from "fuse.js";
import { getFigmaLiveIndex } from "@/lib/figmaIndex";
import { searchStorybookIndex } from "@/lib/storybook";

export type DesignSystemResult = {
  source: "figma" | "docs" | "storybook";
  url: string;
  kind?: string;
  type?: string;
  component?: string;
  title?: string;
  text?: string;
};

function safeFuse<T extends object>(items: T[], keys: (keyof T)[]) {
  return new Fuse(items, {
    keys: keys as any,
    threshold: 0.45,
    ignoreLocation: true,
    includeScore: true,
  });
}

export async function searchDesignSystem(
  query: string,
  limit = 30,
): Promise<{ results: DesignSystemResult[] }> {
  const q = (query || "").trim();
  if (!q) return { results: [] };

  // --- Figma ---
  const figma = await getFigmaLiveIndex();
  const figmaFuse = safeFuse(figma as any[], [
    "name",
    "normalized",
    "page",
    "frame",
    "path",
  ]);

  const figmaHits: DesignSystemResult[] = figmaFuse
    .search(q, { limit: 20 })
    .map((h): DesignSystemResult | null => {
      const item = h.item as any;

      const url: string =
        item?.figmaUrl ||
        (item?.fileKey && item?.id
          ? `https://www.figma.com/file/${item.fileKey}?node-id=${encodeURIComponent(
              item.id,
            )}`
          : "");

      if (!url) return null;

      return {
        source: "figma", // ✅ literal union, not string
        url,
        component: typeof item?.name === "string" ? item.name : undefined,
        title: typeof item?.name === "string" ? item.name : undefined,
        kind: "Figma",
        type: typeof item?.kind === "string" ? item.kind : "component",
      };
    })
    .filter((r): r is DesignSystemResult => !!r);

  // --- Storybook ---


  // inside searchDesignSystem():
  const sb = await searchStorybookIndex(q, 20);

  const storyHits: DesignSystemResult[] = sb
    .map(
      (item): DesignSystemResult => ({
        source: "storybook",
        url: item.url,
        component: item.component,
        title: item.kind, // or item.component, but kind is more specific
        kind: item.kind,
        type: item.type,
        text: item.storyName ?? undefined,
      }),
    )
    .filter((r) => !!r.url);

  // --- Docs (optional; keep empty for now) ---
  const docHits: DesignSystemResult[] = [];

  // Merge + de-dupe by URL
  const all = [...figmaHits, ...storyHits, ...docHits];

  const seen = new Set<string>();
  const deduped = all
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, limit);

  return { results: deduped };
}
