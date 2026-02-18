// src/app/api/chat/route.ts
export const runtime = "nodejs";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { listCloseComponents } from "@/lib/search";
import { listDocsForComponent } from "@/lib/figmaDocs";
import {
  fetchNodeText,
  fetchFigmaNode,
  collectText,
  collectComponentUsage,
} from "@/lib/figma";

import { searchDesignSystem } from "@/lib/designSystemSearch";

// -------------------- OpenAI --------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// -------------------- Sessions --------------------
// IMPORTANT: Store only USER + JSON ASSISTANT content here.
// Do NOT store rendered markdown output (it breaks "JSON-only" compliance).
type StoredMsg = { role: "user" | "assistant"; content: string };
const sessions: Record<string, StoredMsg[]> = {};

// -------------------- Helpers --------------------
function isLocalhostUrl(href: string) {
  try {
    const u = new URL(href);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function sanitizeUrl(url: any): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return null;
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function stripLocalhostLinks(text: string) {
  return text.replace(
    /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s)"]*/g,
    "",
  );
}

// Extract the first JSON object from a response that might contain extra text.
function extractJsonObject(text: string): any | null {
  if (!text || typeof text !== "string") return null;
  const s = text.trim();

  // Fast path
  try {
    return JSON.parse(s);
  } catch {
    // continue
  }

  // Find first '{' and attempt to balance braces.
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = s.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function loadContentGuidelines() {
  const dir = path.join(process.cwd(), "src/data/content-writing");
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const merged = files.map((file) =>
    JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")),
  );
  return Object.assign({}, ...merged);
}

// Basic TTL cache (in-memory) – good enough for dev and Node runtime.
// In prod, swap with Redis/KV.
type CacheEntry<T> = { value: T; expiresAt: number };
const ttlCache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const hit = ttlCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    ttlCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  ttlCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// -------------------- Figma matching --------------------
async function findFigmaComponent(query: string) {
  const q = (query || "").trim();
  if (!q) return { error: "Missing query" };

  // Cache close component list for 5 minutes (fast + reduces repeated work)
  const cacheKey = `figma:close:${q.toLowerCase()}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return cached;

  const close = await listCloseComponents(q, 80);

  const candidates = close.map((c: any) => ({
    id: c.id || c.nodeId,
    fileKey: c.fileKey,
    name: c.name,
    page: c.page,
    frame: c.frame,
    figmaUrl:
      c.figmaUrl ||
      `https://www.figma.com/file/${c.fileKey}?node-id=${encodeURIComponent(
        (c.id || c.nodeId || "").toString(),
      )}`,
    image: c.imageUrl || null,
  }));

  function normalizeName(s: string) {
    return (s || "")
      .toLowerCase()
      .replace(/^hs:\s*/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const qq = normalizeName(q);
  const qTokens = qq.split(" ").filter(Boolean);

  function scoreText(target: string) {
    const nn = normalizeName(target);
    if (!nn) return 0;

    if (nn === qq) return 3000;
    if (nn.startsWith(`${qq} `)) return 2400;

    const words = nn.split(" ");
    const tokenHits = qTokens.filter((t) => words.includes(t)).length;
    const allTokens = qTokens.length > 0 && tokenHits === qTokens.length;

    let score = 0;
    if (allTokens) score += 1800;
    else score += tokenHits * 400;

    if (nn.includes(qq)) score += 600;

    // penalties to avoid variants beating base
    let penalty = 0;
    if (qq === "select" && nn.includes("multi")) penalty += 900;
    if (nn.includes("with ")) penalty += 200;
    if (nn.includes("compact")) penalty += 150;

    return Math.max(0, score - penalty);
  }

  // Page-first
  const pageScores = new Map<string, number>();
  for (const c of candidates) {
    const p = c.page || "";
    const s = scoreText(p);
    const prev = pageScores.get(p) ?? 0;
    if (s > prev) pageScores.set(p, s);
  }

  const topPages = Array.from(pageScores.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([, s]) => s > 0)
    .slice(0, 3)
    .map(([p]) => p);

  const scoped = topPages.length
    ? candidates.filter((c) => topPages.includes(c.page))
    : candidates;

  const scored = scoped
    .map((item) => {
      const label = `${item.page || ""} ${item.frame || ""} ${item.name || ""}`;
      const score = scoreText(label) + scoreText(item.name) * 2;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0] && scored[0].score > 0 ? scored[0] : null;

  const result = {
    best,
    candidates: scored.slice(0, 50),
  };

  cacheSet(cacheKey, result, 5 * 60 * 1000);
  return result;
}

// -------------------- Tool: Combined component details --------------------
function normalizeName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/^hs:\s*/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreName(q: string, name: string) {
  const qq = normalizeName(q);
  const nn = normalizeName(name);
  if (!nn) return 0;

  if (nn === qq) return 2000;
  if (nn === `${qq} native`) return 1800;
  if (nn.startsWith(`${qq} `)) return 1600;

  let penalty = 0;
  if (nn.includes("multi")) penalty += 600;
  if (nn.includes("with ")) penalty += 200;
  if (nn.includes("compact")) penalty += 100;

  const words = nn.split(" ");
  if (words.includes(qq)) return 1200 - penalty;
  if (nn.includes(qq)) return 900 - penalty;

  return 0;
}

async function findComponentDetails(args: {
  query: string;
  includeFigmaText?: boolean;
}) {
  const userQuery = (args?.query || "").trim();
  if (!userQuery) return { error: "Missing query" };

  // 1) Figma
  const figmaResult = await findFigmaComponent(userQuery);
  const figma = figmaResult?.best ?? null;

  // 2) Docs
  const docsCandidates = await listDocsForComponent(userQuery, 5);
  const bestDocs =
    docsCandidates
      ?.slice()
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;

  // 3) Storybook (EXPLICIT SOURCE)
  // Uses shared search function that tags source.
  const ds = await searchDesignSystem(userQuery);
  const storybookCandidates = (ds.results || [])
    .filter((r: any) => r.source === "storybook")
    .map((r: any) => {
      const safeUrl = sanitizeUrl(r.url);
      const name = r.component || r.kind || r.title || "";
      return {
        name,
        component: r.component,
        kind: r.kind,
        url: safeUrl,
        score: safeUrl ? scoreName(userQuery, name) : 0,
      };
    })
    .filter((r: any) => r.url)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  const bestStorybook = storybookCandidates[0] || null;
  const storybookUrl = bestStorybook?.url || null;

  // 4) Resolve canonical name
  const figmaName = figma?.name || "";
  const storyName = bestStorybook?.name || "";

  const pickedName =
    normalizeName(storyName) === normalizeName(userQuery)
      ? storyName
      : normalizeName(figmaName) === normalizeName(userQuery)
        ? figmaName
        : figmaName || storyName || userQuery;

  // 5) OPTIONAL deep read Figma text
  let figmaText: string[] = [];
  const includeFigmaText = !!args.includeFigmaText;

  if (includeFigmaText && figma?.id && figma?.fileKey) {
    const textKey = `figma:text:${figma.fileKey}:${figma.id}`;
    const cachedText = cacheGet<string[]>(textKey);
    if (cachedText) {
      figmaText = cachedText;
    } else {
      try {
        figmaText = await fetchNodeText(figma.fileKey, figma.id);
        cacheSet(textKey, figmaText, 24 * 60 * 60 * 1000); // 24h
      } catch (e) {
        console.warn("Failed to fetchNodeText for figma node", e);
      }
    }
  }

  return {
    name: pickedName,

    figmaUrl: figma?.figmaUrl || null,
    preview: figma?.image || null,
    page: figma?.page || null,
    frame: figma?.frame || null,

    figmaText,

    storybookUrl,
    storybookCandidates,

    docs: bestDocs
      ? { url: bestDocs.url, text: bestDocs.text, frameName: bestDocs.name }
      : null,

    docsCandidates: (docsCandidates || []).map((d: any) => ({
      url: d.url,
      frameName: d.name,
      text: d.text,
      score: d.score,
    })),

    candidates: figmaResult?.candidates || [],
  };
}

// -------------------- Tool dispatch --------------------
async function runTool(name: string, args: any) {
  switch (name) {
    case "findComponentDetails":
      return await findComponentDetails(args);
    case "reviewFigmaFrame":
      return await reviewFigmaFrame(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function reviewFigmaFrame(args: { url: string }) {
  const safe = sanitizeUrl(args?.url);
  if (!safe) return { error: "Invalid URL" };

  function normalizeFigmaNodeId(nodeId: string): string {
    const raw = (nodeId || "").trim();

    // Common case from URLs: "8609-11858" should be "8609:11858"
    // Only do this when it looks like two numeric parts.
    if (/^\d+-\d+$/.test(raw)) return raw.replace("-", ":");

    return raw;
  }

  const parsed = parseFigmaLink(safe);
  if (!parsed)
    return { error: "Could not parse Figma link (need node-id=...)" };

  const { fileKey, nodeId } = parsed;

  const nodeIdApi = /^\d+-\d+$/.test(nodeId)
    ? nodeId.replace("-", ":")
    : nodeId;

  const raw = await fetchFigmaNode(fileKey, nodeIdApi);

  const doc =
    raw?.nodes?.[nodeIdApi]?.document || raw?.nodes?.[nodeId]?.document;

  if (!doc) {
    return {
      error: "Node not found in Figma response",
      debug: {
        fileKey,
        nodeIdFromUrl: nodeId,
        nodeIdApi,
        returnedNodeKeys: Object.keys(raw?.nodes || {}),
      },
    };
  }

  const frameName = doc.name || "Frame";
  const textParts: string[] = [];
  collectText(doc, textParts);

  const frameText = Array.from(
    new Set(textParts.map((t) => t.trim()).filter(Boolean)),
  ).join("\n");

  const compParts: { type: string; name?: string }[] = [];
  collectComponentUsage(doc, compParts);

  return {
    figmaUrl: safe,
    fileKey,
    nodeId: nodeIdApi, // ✅ optional: return the API-normalized node id
    frameName,
    frameText,
    componentHits: compParts.slice(0, 200),
  };
}

// -------------------- Tool schema --------------------
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "findComponentDetails",
      description:
        "Fetch combined details for a component: Figma link + Docs usage text + Storybook link. Use includeFigmaText only when the user asks for text/guidelines.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Component name or keyword." },
          includeFigmaText: {
            type: "boolean",
            description:
              "Set true ONLY when user asks for guidance/copy/when-to-use text from the Figma file.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reviewFigmaFrame",
      description:
        "Given a Figma link with node-id, fetch the frame and return text + component usage signals for review.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Figma URL containing node-id." },
        },
        required: ["url"],
      },
    },
  },
];

async function summarizeUsageFromDocs(openai: OpenAI, docsText: string) {
  const text = (docsText || "").trim();
  if (!text) return "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You summarize Helios design system documentation into a short "Usage" section.

Rules:
- Output ONLY a markdown bullet list (each line starts with "- ").
- 4–8 bullets max.
- Use only what is in the provided docs text. Do not invent.
- Prefer "When to use", "When not to use", key rules, accessibility, and content guidance if present.`,
      },
      { role: "user", content: text },
    ],
  });

  const out = (completion.choices?.[0]?.message?.content || "").trim();
  if (!out) return "";

  // Ensure bullets even if model returns plain lines
  if (!out.startsWith("- ")) {
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `- ${l.replace(/^-+\s*/, "")}`)
      .join("\n");
  }

  return out;
}

function buildCopyReviewPrompt(contentGuidelines: any) {
  return `
You are a copy reviewer for Lightspeed Helios UI writing.

You MUST use the Helios Content Guidelines JSON below as the source of truth.
If a rule is not present, do NOT invent it.

### Helios Content Guidelines JSON
${JSON.stringify(contentGuidelines, null, 2)}

Task:
- Review the provided UI copy for tone, grammar, clarity, accessibility, and consistency.
- Produce a revised version if needed.
- Explain changes with short, specific reasons tied to the guidelines (no fluff).
- Ask ONE useful follow-up question only if it would materially change the copy.

Output STRICT JSON only:

{
  "verdict": "pass" | "revise",
  "revisedCopy": string,
  "reasons": string[],
  "guidelineRefs": string[],
  "followUpQuestion": string | null
}

Rules:
- revisedCopy must be the final recommended copy (even if verdict is "pass", return the original).
- reasons: 2–6 bullets, each concise.
- followUpQuestion: null if not needed.
`;
}
function extractCopyCandidate(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";

  // 1) If user used quotes, prefer that
  const quoted = s.match(/["“](.+?)["”]\s*$/)?.[1]?.trim();
  if (quoted) return quoted;

  // 2) If there's a colon, assume copy is after it
  // e.g. "Check this copy: Your account..."
  const colonIdx = s.lastIndexOf(":");
  if (colonIdx !== -1 && colonIdx < s.length - 1) {
    const after = s.slice(colonIdx + 1).trim();
    if (after.length >= 10) return after;
  }

  // 3) Remove common request prefixes and return remainder
  // e.g. "Can you check if this copy is correct Your account..."
  const prefixes: RegExp[] = [
    /^can you\s+/i,
    /^could you\s+/i,
    /^please\s+/i,
    /^help me\s+/i,
    /^(check|review|rewrite|reword)\s+(if\s+)?(this\s+)?(copy|microcopy|ui copy)\s*(is\s*(correct|ok|okay))?\s*/i,
    /^is\s+this\s+(copy|microcopy|ui copy)\s*(correct|ok|okay)\s*/i,
  ];

  let rest = s;
  for (const rx of prefixes) rest = rest.replace(rx, "").trim();

  // 4) If user pasted multiple lines, keep them
  // 5) If the remainder is still basically the whole prompt and too short, fall back to original
  if (rest.length >= 10) return rest;

  return s;
}

type Intent = "COPY_REVIEW" | "COMPONENT_LOOKUP" | "FIGMA_REVIEW" | "GENERAL";

function detectIntent(message: string): Intent {
  const s = (message || "").trim();
  const lower = s.toLowerCase();

  // 0) Figma frame review MUST win if a node-id link exists
  if (extractFigmaUrl(message) && /node-id=|node_id=/i.test(message)) {
    return "FIGMA_REVIEW";
  }

  const copySignals = [
    // explicit “copy”
    "check this copy",
    "review this copy",
    "is this copy",
    "rewrite",
    "reword",
    "microcopy",
    "ui copy",

    // ✅ explicit “content”
    "check this content",
    "review this content",
    "is this content",
    "check this text",
    "review this text",
    "is this text",
    "check this message",
    "review this message",
    "is this message",

    // common UX writing asks
    "tone",
    "grammar",
    "punctuation",
    "style guide",
    "does this sound",
    "is this clear",
    "make this clearer",
    "shorten this",

    // common UI strings (helps when people don’t say “copy”)
    "error message",
    "empty state",
    "helper text",
    "tooltip",
    "banner",
    "toast",
    "notification",
  ];

  // NOTE: remove "figma" here so figma links don't get hijacked
  const componentSignals = [
    "component",
    "storybook",
    "design system",
    "token",
    "variant",
    "props",
    "usage of",
    "how do i use",
    "what is the",
    "pattern",
  ];

  const hasLongSentence = /[.!?]/.test(s) && s.length > 60;
  const hasCopySignal = copySignals.some((k) => lower.includes(k));
  const hasComponentSignal = componentSignals.some((k) => lower.includes(k));

  if (
    hasCopySignal ||
    (hasLongSentence && /(check|review|rewrite|reword|tone|grammar)/i.test(s))
  ) {
    return "COPY_REVIEW";
  }

  if (hasComponentSignal) return "COMPONENT_LOOKUP";

  if (s.split(/\s+/).length <= 3 && /^[a-z0-9:_\-\s]+$/i.test(s)) {
    return "COMPONENT_LOOKUP";
  }

  return "GENERAL";
}

function extractFigmaUrl(message: string): string | null {
  const m = (message || "").match(/https?:\/\/www\.figma\.com\/[^\s)"]+/i);
  return m?.[0] ?? null;
}

function parseFigmaLink(
  url: string,
): { fileKey: string; nodeId: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("figma.com")) return null;

    // Works for /file/FILEKEY/... and /design/FILEKEY/...
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "file" || p === "design");
    if (idx === -1 || !parts[idx + 1]) return null;

    const fileKey = parts[idx + 1];
    const nodeId =
      u.searchParams.get("node-id") || u.searchParams.get("node_id");
    if (!nodeId) return null;

    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

// -------------------- Route --------------------
export async function POST(req: Request) {
  const { message } = await req.json();

  const sessionId = "default"; // TODO: use real session/user id
  const history = sessions[sessionId] || [];

  const contentGuidelines = loadContentGuidelines();

  const intent = detectIntent(String(message || ""));

  // Determine whether we need to check copy content.
  const isCopyReview = intent === "COPY_REVIEW";

  const isComponentLookup = intent === "COMPONENT_LOOKUP";

  // Determine whether we likely need deep Figma text (fast heuristic).
  const needsFigmaText =
    intent === "COMPONENT_LOOKUP" &&
    typeof message === "string" &&
    /(when to use|usage|guidance|guidelines|do i|should i|empty state|error message|helper text)/i.test(
      message,
    );

    const componentSystemPrompt = `
You are a Helios design system assistant.

You will help with components, tokens, and patterns.

Rules:
- Prefer existing Helios components/patterns before inventing new ones.
- Use findComponentDetails(query) for component questions.
- Output STRICT JSON only in this exact shape:

{
  "componentName": string,
  "summary": string,
  "usage": string,
  "livePreviewCode": string | null
}

Critical:
- If the user is asking about a component, ALWAYS attempt to return livePreviewCode.
- livePreviewCode MUST be ONLY JSX (no backticks, no markdown), like:
  "<Button appearance='primary'>Save</Button>"
- If you truly cannot, return null.
`;

    const generalSystemPrompt = `
You are a single assistant that helps with:
1) Lightspeed Helios Design System / components / tokens / patterns
2) Product design critique and UI suggestions
3) Content writing and rewriting in strict Helios tone, grammar, and structure

You must infer intent from the user's message.

### Helios Content Guidelines JSON
${JSON.stringify(contentGuidelines, null, 2)}
`;


  if (isCopyReview) {
    const copyToReview = extractCopyCandidate(String(message || ""));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: buildCopyReviewPrompt(contentGuidelines) },
        { role: "user", content: copyToReview },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(raw);

    if (!parsed) {
      return NextResponse.json({
        reply: "I couldn't format the review correctly. Please try again.",
        raw,
      });
    }

    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    const guidelineRefs = Array.isArray(parsed.guidelineRefs)
      ? parsed.guidelineRefs
      : [];

    if (!parsed) {
      return NextResponse.json({
        reply: "I couldn't format the review correctly. Please try again.",
        raw,
      });
    }

    const refs = Array.isArray(parsed.guidelineRefs)
      ? parsed.guidelineRefs
      : [];
    if (refs.length === 0) {
      parsed.guidelineRefs = [
        "No guideline references returned (check prompt)",
      ];
    }

    const replyMarkdown = `
## Copy review
**Verdict:** ${parsed.verdict === "pass" ? "✅ Pass" : "✏️ Needs revision"}

---

## Revised copy
"${parsed.revisedCopy}"

---

## Why
${reasons.map((r: string) => `- ${r}`).join("\n")}

---

## Guidelines referenced
${(guidelineRefs.length
  ? guidelineRefs
  : ["No guideline references returned (check prompt)"]
)
  .map((g: string) => `- ${g}`)
  .join("\n")}

    `.trim();

    return NextResponse.json({
      reply: replyMarkdown,
      data: parsed,
    });
  }

  // ---- FIGMA FRAME REVIEW ----
  const isFigmaReview = intent === "FIGMA_REVIEW";

  if (isFigmaReview) {
    const figmaUrl = extractFigmaUrl(String(message || ""));
    if (!figmaUrl) {
      return NextResponse.json({
        reply: "I couldn’t find a Figma link in your message.",
      });
    }

    // Force-fetch the frame data (don’t rely on the model to call the tool)
    const frameData = await reviewFigmaFrame({ url: figmaUrl });

    if ((frameData as any)?.error) {
      return NextResponse.json({
        reply: `I couldn’t load that Figma frame: ${(frameData as any).error}`,
        data: frameData,
      });
    }

    const figmaReviewPrompt = `
You are reviewing a UI frame for:
1) Usability best practices (clarity, hierarchy, affordance, error prevention, accessibility)
2) Whether Helios components are being used appropriately based on the component names found

Rules:
- Use ONLY the provided frame data. Do not invent UI elements not present.
- If information is missing, say what is missing and ask 1–3 targeted questions.

Return STRICT JSON only:

{
  "type": "figma_review",
  "frameName": string,
  "summary": string,
  "usabilityFindings": string[],
  "heliosComponentFindings": string[],
  "contentFindings": string[],
  "questions": string[]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: figmaReviewPrompt },
        { role: "user", content: JSON.stringify(frameData) },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsedReview = extractJsonObject(raw);

    if (!parsedReview) {
      return NextResponse.json({
        reply:
          "I couldn't format the frame review correctly. Please try again.",
        raw,
        data: frameData,
      });
    }

    const replyMarkdown = `
## Frame review: ${parsedReview.frameName || "Frame"}

---

## Summary
${parsedReview.summary || ""}

---

## Usability findings
${
  Array.isArray(parsedReview.usabilityFindings)
    ? parsedReview.usabilityFindings.map((x: string) => `- ${x}`).join("\n")
    : ""
}

---

## Helios component findings
${
  Array.isArray(parsedReview.heliosComponentFindings)
    ? parsedReview.heliosComponentFindings
        .map((x: string) => `- ${x}`)
        .join("\n")
    : ""
}

---

## Content findings
${
  Array.isArray(parsedReview.contentFindings)
    ? parsedReview.contentFindings.map((x: string) => `- ${x}`).join("\n")
    : ""
}

${
  Array.isArray(parsedReview.questions) && parsedReview.questions.length
    ? `\n---\n\n## Questions\n${parsedReview.questions.map((q: string) => `- ${q}`).join("\n")}\n`
    : ""
}
`.trim();

    return NextResponse.json({
      reply: replyMarkdown,
      data: { ...parsedReview, frameData },
    });
  }

  // Build messages: system + prior user/assistant JSON-only + user
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        intent === "COMPONENT_LOOKUP"
          ? componentSystemPrompt
          : generalSystemPrompt,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];


  // Deterministic references gathered from tool output
  const gatheredRefs: {
    figma: { label: string; href: string }[];
    docs: { label: string; href: string }[];
    storybook: { label: string; href: string }[];
  } = { figma: [], docs: [], storybook: [] };

  // Tool loop
  let finalModelText: string | null = null;

  for (let i = 0; i < 6; i++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages,
      tools,
    });

    const msg = completion.choices?.[0]?.message;
    if (!msg) break;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalModelText = msg.content || "";
      break;
    }

    messages.push(msg);

    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;

      const { name, arguments: rawArgs } = tc.function;

      let args: any = {};
      try {
        args = JSON.parse(rawArgs || "{}");
      } catch {
        args = {};
      }

      // Inject heuristic (only if model didn't decide)
      if (name === "findComponentDetails" && args.includeFigmaText == null) {
        args.includeFigmaText = needsFigmaText;
      }

      const result: any = await runTool(name, args);

      // Gather refs safely (no localhost)
      if (name === "findComponentDetails") {
        if (
          typeof result?.figmaUrl === "string" &&
          !isLocalhostUrl(result.figmaUrl)
        ) {
          gatheredRefs.figma.push({
            label: String(result?.name || args.query || "Figma"),
            href: result.figmaUrl,
          });
        }

        if (
          typeof result?.docs?.url === "string" &&
          !isLocalhostUrl(result.docs.url)
        ) {
          gatheredRefs.docs.push({
            label: String(result?.docs?.frameName || "Documentation"),
            href: result.docs.url,
          });
        }

        if (
          typeof result?.storybookUrl === "string" &&
          !isLocalhostUrl(result.storybookUrl)
        ) {
          gatheredRefs.storybook.push({
            label: String(result?.name || args.query || "Storybook"),
            href: result.storybookUrl,
          });
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  if (!finalModelText) {
    return NextResponse.json({
      reply:
        "I couldn't complete the request due to repeated tool calls. Try rephrasing the question more specifically.",
    });
  }

  const cleaned = stripLocalhostLinks(finalModelText);
  const parsed = extractJsonObject(cleaned);

  // If the model still didn't return JSON, fail gracefully.
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({
      reply:
        "I couldn't format the response correctly. Please try again with a more specific component name.",
      raw: cleaned,
    });
  }

  const componentName =
    typeof parsed.componentName === "string" && parsed.componentName.trim()
      ? parsed.componentName.trim()
      : "Component";

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "No summary available.";

  const usage =
    typeof parsed.usage === "string" && parsed.usage.trim() ? parsed.usage : "";

  let docsTextFromTool = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m: any = messages[i];
    if (m?.role === "tool") {
      try {
        const obj = JSON.parse(m.content || "{}");
        if (obj?.docs?.text) {
          docsTextFromTool = String(obj.docs.text);
          break;
        }
      } catch {}
    }
  }

  let finalUsage = usage;

  if (!finalUsage.trim() && docsTextFromTool.trim()) {
    finalUsage = await summarizeUsageFromDocs(openai, docsTextFromTool);
  }

  const livePreviewCode =
    typeof parsed.livePreviewCode === "string" ? parsed.livePreviewCode : null;

  console.log("LIVE PREVIEW DEBUG:", {
    componentName,
    hasLivePreview: typeof parsed.livePreviewCode === "string",
    livePreviewLen:
      typeof parsed.livePreviewCode === "string"
        ? parsed.livePreviewCode.length
        : 0,
    livePreviewSample:
      typeof parsed.livePreviewCode === "string"
        ? parsed.livePreviewCode.slice(0, 120)
        : null,
  });

  // Deterministic links (dedupe)
  const seen = new Set<string>();
  function dedupe(list: { label: string; href: string }[], prefix: string) {
    return list
      .filter((r) => sanitizeUrl(r.href))
      .filter((r) => {
        const k = `${prefix}:${r.href}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 1);
  }

  const figmaLink = dedupe(gatheredRefs.figma, "figma")[0]?.href || null;
  const docsLink = dedupe(gatheredRefs.docs, "docs")[0]?.href || null;
  const storybookLink =
    dedupe(gatheredRefs.storybook, "storybook")[0]?.href || null;

  // NOTE: LivePreview is NOT embedded into markdown. Return it as data.
  const replyMarkdown = `
## Summary
${summary}

---

## Links
${figmaLink ? `\n**Figma:** [Component](${figmaLink})` : `\n**Figma:** Not found`}
${docsLink ? `\n**Docs:** [Documentation](${docsLink})` : `\n**Docs:** Not found`}
${
  storybookLink
    ? `\n**Storybook:** [Documentation](${storybookLink})`
    : `\n**Storybook:** Not found`
}

${finalUsage.trim() ? `\n---\n\n## Usage\n${finalUsage}\n` : ""}
`.trim();

  // Save ONLY JSON assistant response to history (prevents drift).
  // We store the model JSON, not the rendered markdown.
  history.push({ role: "user", content: String(message || "") });
  history.push({
    role: "assistant",
    content: JSON.stringify({
      ...parsed,
      usage: finalUsage,
    }),
  });
  sessions[sessionId] = history;

  return NextResponse.json({
    reply: replyMarkdown,
    data: {
      componentName,
      summary,
      usage: finalUsage,
      livePreviewCode,
      links: {
        figma: figmaLink,
        docs: docsLink,
        storybook: storybookLink,
      },
    },
  });
}
