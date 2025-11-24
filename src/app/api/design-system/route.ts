import { NextResponse } from "next/server";
import { parseStorybookIndex } from "@/lib/parseStorybookIndex";

export async function GET() {
  try {
    const STORYBOOK_BASE =
      "https://lightspeed.github.io/unified-components/react";
    const INDEX_URL = `${STORYBOOK_BASE}/index.json`;

    // 1️⃣ Fetch Storybook index.json
    const response = await fetch(INDEX_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Storybook index.json: ${response.status}`
      );
    }

    const raw = await response.json();

    // 2️⃣ Parse and structure it
    const parsed = parseStorybookIndex(raw, STORYBOOK_BASE);

    // 3️⃣ Return structured data
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error in /api/design-system:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
