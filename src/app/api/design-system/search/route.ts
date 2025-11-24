import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  parseStorybookIndex,
  searchStorybookEntries,
} from "@/lib/parseStorybookIndex";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";

  if (!query) {
    return NextResponse.json(
      { error: "Missing query param ?q=" },
      { status: 400 }
    );
  }

  try {
    const STORYBOOK_BASE =
      "https://lightspeed.github.io/unified-components/react";
    const FILE_PATH = path.join(
      process.cwd(),
      "public/design-system/index.json"
    );

    // Load cached index
    const rawJson = fs.readFileSync(FILE_PATH, "utf-8");
    const raw = JSON.parse(rawJson);
    const parsed = parseStorybookIndex(raw, STORYBOOK_BASE);

    // Perform search
    const results = searchStorybookEntries(parsed, query);

    return NextResponse.json({
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in /api/design-system/search:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
