// src/app/api/figma/route.ts
import { NextResponse } from "next/server";
import { getFigmaLiveIndex } from "@/lib/figmaIndex";
import { fetchComponentImages } from "@/lib/figma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get("fileKey") || process.env.FIGMA_FILE_KEY;

  const q = (searchParams.get("q") || "").trim();
  const includeImages = searchParams.get("includeImages") === "true";

  const defaultLimit = 20;
  const limitParam = searchParams.get("limit");

  const limit =
    q.length > 0
      ? Math.min(Number(limitParam || defaultLimit), 100)
      : Number.POSITIVE_INFINITY;

  if (!fileKey) {
    return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
  }

  try {
    const all = await getFigmaLiveIndex(fileKey);

    const filtered =
      q.length > 0
        ? all.filter((i) =>
            `${i.name} ${i.description || ""} ${i.page || ""} ${i.frame || ""}`
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
        : all;

    const sliced =
      limit === Number.POSITIVE_INFINITY ? filtered : filtered.slice(0, limit);

    // Only render images for a small list, never for the whole index
    let images: Record<string, string> = {};
    if (includeImages && sliced.length > 0 && sliced.length <= 50) {
      const ids = sliced.map((i) => i.id);
      images = (await fetchComponentImages(fileKey, ids)).images || {};
    }

    const components = sliced.map((i) => ({
      ...i,
      imageUrl: includeImages ? (images[i.id] ?? null) : null,
      figmaUrl:
        i.figmaUrl ||
        `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(
          i.id,
        )}`,
    }));

    return NextResponse.json(
      { count: components.length, components },
      {
        headers: {
          "cache-control": "s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (e: any) {
    console.error("Figma fetch error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
