import { NextResponse } from "next/server";
import { fetchFile, indexComponents, fetchComponentImages } from "@/lib/figma";

type FigmaComponent = {
  id: string;
  name: string;
  description?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get("fileKey") || process.env.FIGMA_FILE_KEY;

  if (!fileKey) {
    return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
  }

  try {
    const file = await fetchFile(fileKey);
    const items = indexComponents(file, fileKey) as unknown as FigmaComponent[];

    // If indexComponents doesn't always return `id`, add a quick guard
    const validItems = items.filter((i) => i.id);
    const ids = validItems.map((i) => i.id);
    const images = await fetchComponentImages(fileKey, ids);

    const components = validItems.map((i) => ({
      ...i,
      imageUrl: images.images?.[i.id] ?? null,
      figmaUrl: `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(
        i.id
      )}`,
    }));

    return NextResponse.json({ count: components.length, components });
  } catch (e: any) {
    console.error("Figma fetch error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
