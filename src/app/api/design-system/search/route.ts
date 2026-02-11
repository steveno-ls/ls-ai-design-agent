import { NextResponse } from "next/server";
import { searchDesignSystem } from "@/lib/designSystemSearch";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Number(searchParams.get("limit") || "30") || 30;

  if (!q) return NextResponse.json({ results: [] });

  const data = await searchDesignSystem(q, limit);
  return NextResponse.json(data);
}
