// src/lib/storybookIndex.ts
import fs from "fs";
import path from "path";
import Fuse from "fuse.js";
import {
  parseStorybookIndex,
  type ParsedStorybookIndex,
  type ParsedStorybookEntry,
} from "@/lib/parseStorybookIndex";

let cachedParsed: ParsedStorybookIndex | null = null;
let cachedFuse: Fuse<ParsedStorybookEntry> | null = null;
let lastLoadedAt = 0;
const TTL_MS = 60_000;

export function getStorybookBaseUrl() {
  return "https://lightspeed.github.io/unified-components/react";
}

export function getStorybookIndexFilePath() {
  return path.join(process.cwd(), "public", "design-system", "index.json");
}

export function getParsedStorybookIndexCached(): ParsedStorybookIndex | null {
  const now = Date.now();
  if (cachedParsed && now - lastLoadedAt < TTL_MS) return cachedParsed;

  const FILE_PATH = getStorybookIndexFilePath();
  if (!fs.existsSync(FILE_PATH)) {
    console.warn(`Storybook index not found at ${FILE_PATH}`);
    cachedParsed = null;
    cachedFuse = null;
    lastLoadedAt = now;
    return null;
  }

  const rawJson = fs.readFileSync(FILE_PATH, "utf-8");
  const raw = JSON.parse(rawJson);

  cachedParsed = parseStorybookIndex(raw, getStorybookBaseUrl());

  // Build Fuse once per reload
  cachedFuse = new Fuse(cachedParsed.list, {
    keys: ["component", "kind", "storyName", "section"],
    threshold: 0.45,
    ignoreLocation: true,
  });

  lastLoadedAt = now;
  return cachedParsed;
}

export function searchStorybookFuzzy(
  query: string,
  limit = 20,
): ParsedStorybookEntry[] {
  const q = (query || "").trim();
  if (!q) return [];

  const parsed = getParsedStorybookIndexCached();
  if (!parsed || !cachedFuse) return [];

  // Fuse provides ranked fuzzy results
  return cachedFuse.search(q, { limit }).map((r) => r.item);
}
