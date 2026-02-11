// src/lib/figmaIndex.ts
import { fetchFile, indexComponents } from "@/lib/figma";

export type FigmaIndexedComponent = {
  id: string;
  name: string;
  description?: string;
  fileKey: string;
  page?: string;
  frame?: string;
  path?: string;
  figmaUrl?: string;
  imageUrl?: string;
  normalized?: string;
  kind?: string; // "component" | "componentSet" | "style" etc (if you add it)
};

type CacheEntry<T> = { value: T; expiresAt: number };
const mem = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    mem.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  mem.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function normalizeName(name: string) {
  return (name || "")
    .replace(/[=,_]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Loads + indexes components from Figma (shared for both API + agent).
 * This is the "real implementation" that used to live only in /api/figma.
 */
async function loadFigmaIndexUncached(
  fileKey: string,
): Promise<FigmaIndexedComponent[]> {
  const file = await fetchFile(fileKey);
  const items = indexComponents(file, fileKey);

  const valid = (items || []).filter((i: any) => i?.id && i?.name);

  // Normalize + add figmaUrl deterministically
  return valid.map((i: any) => ({
    ...i,
    fileKey,
    figmaUrl:
      i.figmaUrl ||
      `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(
        i.id,
      )}`,
    normalized: normalizeName(i.name),
  }));
}

/**
 * Shared function:
 * - used by lib/search.ts (Fuse search)
 * - used by src/app/api/figma/route.ts
 *
 * NOTE: cache key includes fileKey to support multiple DS files.
 */
export async function getFigmaLiveIndex(
  fileKey: string = process.env.FIGMA_FILE_KEY || "",
): Promise<FigmaIndexedComponent[]> {
  if (!fileKey) return [];

  const key = `figma:index:${fileKey}`;
  const cached = cacheGet<FigmaIndexedComponent[]>(key);
  if (cached) return cached;

  const data = await loadFigmaIndexUncached(fileKey);

  // Cache 60s (like your original lib did)
  cacheSet(key, data, 60_000);
  return data;
}
