import { NextResponse } from "next/server";
import { findDocsForComponent, listDocsForComponent } from "@/lib/figmaDocs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const best = await findDocsForComponent(q);
  const list = await listDocsForComponent(q, 5);

  return NextResponse.json({
    query: q,
    best,
    candidates: list,
  });
}
