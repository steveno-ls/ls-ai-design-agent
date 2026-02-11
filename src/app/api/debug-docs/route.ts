import { NextResponse } from "next/server";
import { findBestComponent, listCloseComponents } from "@/lib/search";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const best = await findBestComponent(q);
  const close = await listCloseComponents(q, 10);

  return NextResponse.json({
    query: q,
    best: best ? { name: best.name, page: best.page, frame: best.frame } : null,
    close: close.map((c: any) => ({
      name: c.name,
      page: c.page,
      frame: c.frame,
    })),
  });
}
