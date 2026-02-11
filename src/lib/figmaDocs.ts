import {
  tokenizeQuery,
  scorePage,
  scoreFrame,
  normalizeText,
} from "@/lib/figmaSearch";

type DocHit = {
  nodeId: string;
  page: string;
  name: string;
  text: string;
  url: string;
};

let cache: { hits: DocHit[]; builtAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[\s/_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function collectText(node: any, out: string[]) {
  if (!node) return;
  if (node.type === "TEXT" && typeof node.characters === "string") {
    const t = node.characters.trim();
    if (t) out.push(t);
  }
  if (Array.isArray(node.children)) {
    for (const ch of node.children) collectText(ch, out);
  }
}

function walkFrames(
  node: any,
  pageName: string,
  out: { id: string; name: string; page: string; doc: any }[],
) {
  if (!node) return;

  if (
    (node.type === "FRAME" || node.type === "SECTION") &&
    node.id &&
    node.name
  ) {
    out.push({ id: node.id, name: node.name, page: pageName, doc: node });
  }

  if (Array.isArray(node.children)) {
    for (const ch of node.children) walkFrames(ch, pageName, out);
  }
}


async function fetchFigmaFile(fileKey: string) {
  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: { "X-Figma-Token": process.env.FIGMA_TOKEN! },
    cache: "no-store",
  });
  if (!res.ok)
    throw new Error(
      `Figma file fetch failed: ${res.status} ${await res.text()}`,
    );
  return res.json();
}

export async function getDocsIndex(): Promise<DocHit[]> {
  const now = Date.now();
  if (cache && now - cache.builtAt < CACHE_TTL_MS) return cache.hits;

  const fileKey = process.env.FIGMA_DOCS_FILE_KEY!;
  if (!fileKey) throw new Error("Missing FIGMA_DOCS_FILE_KEY");

  const file = await fetchFigmaFile(fileKey);

  const frames: { id: string; name: string; page: string; doc: any }[] = [];

  const pages = file.document?.children || [];
  for (const page of pages) {
    walkFrames(page, page.name || "Page", frames);
  }

  const hits: DocHit[] = frames.map((f) => {
    const chunks: string[] = [];
    collectText(f.doc, chunks);
    const text = chunks.join("\n");

    return {
      nodeId: f.id,
      page: f.page,
      name: f.name,
      text,
      url: `https://www.figma.com/design/${fileKey}/Helios-Documentation?node-id=${encodeURIComponent(
        f.id.replace(":", "-"),
      )}`,
    };
  });

  cache = { hits, builtAt: now };
  return hits;
}


export async function listDocsForComponent(componentName: string, limit = 5) {
  const hits = await getDocsIndex();
  const q = (componentName || "").trim();
  if (!q) return [];

  const tokens = tokenizeQuery(q);

  // 1) Rank pages first
  const pageScores = new Map<string, number>();
  for (const h of hits) {
    const prev = pageScores.get(h.page) ?? 0;
    const s = scorePage(tokens, h.page);
    if (s > prev) pageScores.set(h.page, s);
  }

  const topPages = Array.from(pageScores.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([, s]) => s > 0)
    .slice(0, 3)
    .map(([p]) => p);

  const scoped = topPages.length
    ? hits.filter((h) => topPages.includes(h.page))
    : hits;

  // 2) Rank frames inside those pages
  const scored = scoped
    .map((h) => {
      const nameScore = scoreFrame(tokens, h.name);

      const textNorm = normalizeText(h.text);
      const textBoost = textNorm.includes(tokens.norm) ? 200 : 0;

      // penalty for variants when user asked base component
      const nameNorm = normalizeText(h.name);
      let penalty = 0;
      if (tokens.norm === "select" && nameNorm.includes("multi"))
        penalty += 700;

      const score = Math.max(0, nameScore + textBoost - penalty);
      return { ...h, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

export async function findDocsForComponent(componentName: string) {
  const list = await listDocsForComponent(componentName, 5);
  if (!list.length) return null;

  const tokens = tokenizeQuery(componentName);

  // exact normalized name wins
  const exact = list.find((h) => normalizeText(h.name) === tokens.norm);
  return exact || list[0] || null;
}

