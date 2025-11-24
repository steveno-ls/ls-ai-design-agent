import Fuse from "fuse.js";

// Basic caching
let cacheData: any[] = [];
let lastFetched = 0;

export async function getLiveIndex() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const now = Date.now();

  if (now - lastFetched < 60_000 && cacheData.length) return cacheData;

  const res = await fetch(`${baseUrl}/api/figma`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Figma index failed: ${res.status}`);

  const data = await res.json();

  // Normalize names for better search (strip punctuation, lowercase, etc.)
  cacheData = data.components.map((c: any) => {
    const normalized = c.name
      .replace(/[=,_]/g, " ") // replace = and , with spaces
      .replace(/\s+/g, " ") // collapse extra spaces
      .toLowerCase();
    return { ...c, normalized };
  });

  lastFetched = now;
  console.log(`🔍 Loaded ${cacheData.length} components from Figma`);
  return cacheData;
}

export async function findBestComponent(query: string) {
  const index = await getLiveIndex();
  if (!index?.length) return null;

  const fuse = new Fuse(index, {
    keys: ["name", "normalized"],
    threshold: 0.45,
    ignoreLocation: true,
  });

  const results = fuse.search(query.toLowerCase());
  console.log("🔍 Searching for:", query, "→ Found:", results.length);
  return results[0]?.item || null;
}

export async function listCloseComponents(query: string, limit = 3) {
  const index = await getLiveIndex();
  if (!index?.length) return [];
  const fuse = new Fuse(index, {
    keys: ["name", "normalized"],
    threshold: 0.5,
    ignoreLocation: true,
  });
  return fuse.search(query.toLowerCase(), { limit }).map((r) => r.item);
}

// Dummy explainToken (you can replace with your real token logic)
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

export async function searchDesignSystem(query: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(
    `${baseUrl}/api/design-system/search?q=${encodeURIComponent(query)}`,
    {
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to search design system: ${res.status}`);
  }

  const data = await res.json();
  if (!data.results?.length) {
    return { message: `No matching components found for "${query}".` };
  }

  // Build a markdown-friendly list
  const lines = data.results.slice(0, 5).map((r: any) => {
    return `- [${r.kind}](${r.url}) (${r.type})`;
  });

  return {
    message: `**Results for "${query}"**\n${lines.join("\n")}`,
  };
}



