// src/lib/figmaSearch.ts

export type Tokens = {
  raw: string;
  norm: string;
  words: string[];
};

// 1) Normalize strings (shared across DS + Docs)
export function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/^hs:\s*/g, "") // remove hs:
    .replace(/\(.*?\)/g, "") // remove "(Native)" etc
    .replace(/[^a-z0-9]+/g, " ") // normalize separators
    .trim();
}

// 2) Tokenize query once
export function tokenizeQuery(query: string): Tokens {
  const norm = normalizeText(query);

  // keep it simple for now; we can add stopwords later
  const words = norm.split(" ").filter(Boolean);

  return { raw: query, norm, words };
}

// 3) Score a candidate label against query tokens
// Higher score = better match
export function scoreLabel(tokens: Tokens, label: string) {
  const n = normalizeText(label);
  if (!n) return 0;

  // Exact label match wins
  if (n === tokens.norm) return 3000;

  // Count token hits
  const labelWords = new Set(n.split(" ").filter(Boolean));
  let hitCount = 0;

  for (const w of tokens.words) {
    if (labelWords.has(w)) hitCount += 1;
  }

  // Whole-token hits are strong
  let score = hitCount * 500;

  // Partial contains helps (e.g. "select" in "select native")
  if (tokens.norm && n.includes(tokens.norm)) score += 300;

  // Penalties (avoid variants winning when user asked base)
  if (labelWords.has("multi") || n.includes("multiselect")) score -= 700;
  if (labelWords.has("with")) score -= 150;
  if (labelWords.has("compact")) score -= 150;

  return Math.max(0, score);
}

// 4) Pick best match from a list
export function pickBest<T>(
  tokens: Tokens,
  items: T[],
  getLabel: (item: T) => string,
) {
  const scored = items
    .map((it) => ({
      item: it,
      label: getLabel(it),
      score: scoreLabel(tokens, getLabel(it)),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.score ? scored[0] : null;

  return {
    best: best?.item ?? null,
    scored, // keep for debugging
  };
}
export function scorePage(tokens: Tokens, pageName: string) {
  return scoreLabel(tokens, pageName);
}

export function scoreFrame(tokens: Tokens, frameName: string) {
  // same scoring rules for now (works well in practice)
  return scoreLabel(tokens, frameName);
}


