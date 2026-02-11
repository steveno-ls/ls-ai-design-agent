// src/lib/figma.ts

// Raw Figma API Access - talks directly to Figma API's to access the data source

export async function fetchFile(fileKey: string) {
  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: {
      "X-Figma-Token": process.env.FIGMA_TOKEN!,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma /files failed: ${res.status} - ${text}`);
  }

  return res.json();
}

export function indexComponents(fileJson: any, fileKey: string) {
  const result: {
    id: string;
    path: string;
    name: string;
    description?: string;
    fileKey: string;
    page: string;
    frame: string;
  }[] = [];

  function walk(node: any, breadcrumb: string[]) {
    const crumb = [...breadcrumb, node.name];

    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      const page = breadcrumb[0] || "Page";
      const frame = breadcrumb.slice(1).join(" / ") || node.name;

      result.push({
        id: node.id,
        name: node.name,
        description: node.description || "",
        fileKey,
        page,
        frame,
        path: crumb.join(" / "),
      });
    }

    if (node.children) {
      for (const ch of node.children) walk(ch, crumb);
    }
  }

  const pages = fileJson.document?.children || [];
  for (const page of pages) {
    walk(page, [page.name]);
  }

  return result;
}

export async function fetchComponentImages(fileKey: string, nodeIds: string[]) {
  if (!nodeIds?.length) {
    console.warn("⚠️ No node IDs provided to fetchComponentImages");
    return { images: {} };
  }

  const headers = { "X-Figma-Token": process.env.FIGMA_TOKEN! };
  const allImages: Record<string, string> = {};

  // Tunables
  const baseBatchSize = 10; // was 50
  const baseScale = 0.5; // was 2
  const format: "png" | "svg" = "png"; // try "svg" if that works for you

  async function requestImages(ids: string[], scale: number) {
    const params = new URLSearchParams({
      ids: ids.join(","),
      format,
      scale: String(scale),
    });

    const url = `https://api.figma.com/v1/images/${fileKey}?${params.toString()}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Figma /images failed: ${res.status} ${errorText}`);
    }

    const json = await res.json();
    return (json.images || {}) as Record<string, string>;
  }

  for (let i = 0; i < nodeIds.length; i += baseBatchSize) {
    const batch = nodeIds.slice(i, i + baseBatchSize);

    try {
      const images = await requestImages(batch, baseScale);
      Object.assign(allImages, images);
      continue;
    } catch (e) {
      // Fallback 1: smaller batch + smaller scale
      try {
        const half = batch.slice(0, Math.max(1, Math.floor(batch.length / 2)));
        const images = await requestImages(half, 0.25);
        Object.assign(allImages, images);
        continue;
      } catch (e2) {
        // Fallback 2: skip this batch (don’t nuke the whole request)
        console.warn("⚠️ Skipping image batch due to render timeout/failure", {
          fileKey,
          batchCount: batch.length,
          error: String(e2),
        });
        continue;
      }
    }
  }

  return { images: allImages };
}

function collectTextNodes(node: any, out: string[]) {
  if (!node) return;
  if (node.type === "TEXT" && typeof node.characters === "string") {
    const t = node.characters.trim();
    if (t) out.push(t);
  }
  if (Array.isArray(node.children)) {
    for (const ch of node.children) collectTextNodes(ch, out);
  }
}

export async function fetchNodeText(fileKey: string, nodeId: string) {
  const headers = { "X-Figma-Token": process.env.FIGMA_TOKEN! };

  const res = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(
      nodeId,
    )}`,
    { headers },
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Figma nodes failed: ${res.status} - ${t}`);
  }

  const json = await res.json();
  const root = json?.nodes?.[nodeId]?.document;

  const texts: string[] = [];
  collectTextNodes(root, texts);

  // keep it small (you can raise this)
  return texts.slice(0, 60);
}

export async function fetchFigmaNode(fileKey: string, nodeId: string) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error("Missing FIGMA_TOKEN");

  const res = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": token } },
  );

  if (!res.ok) throw new Error(`Figma nodes fetch failed: ${res.status}`);
  return res.json();
}

export function collectText(node: any, acc: string[]) {
  if (!node) return;

  if (node.type === "TEXT" && typeof node.characters === "string") {
    const t = node.characters.trim();
    if (t) acc.push(t);
  }

  const children = Array.isArray(node.children) ? node.children : [];
  for (const c of children) collectText(c, acc);
}

export function collectComponentUsage(
  node: any,
  acc: { type: string; name?: string }[],
) {
  if (!node) return;

  if (
    node.type === "INSTANCE" ||
    node.type === "COMPONENT" ||
    node.type === "COMPONENT_SET"
  ) {
    acc.push({ type: node.type, name: node.name });
  }

  const children = Array.isArray(node.children) ? node.children : [];
  for (const c of children) collectComponentUsage(c, acc);
}
