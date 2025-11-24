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
  const batchSize = 50;

  for (let i = 0; i < nodeIds.length; i += batchSize) {
    const batch = nodeIds.slice(i, i + batchSize);
    const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(
      batch.join(",")
    )}&format=png&scale=2`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Figma /images failed:", res.status, errorText);
      throw new Error(`Figma /images failed: ${res.status}`);
    }

    const json = await res.json();
    Object.assign(allImages, json.images);
  }

  return { images: allImages };
}