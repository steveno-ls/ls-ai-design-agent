// src/lib/storybook.ts
import { searchStorybookFuzzy } from "@/lib/storybookIndex";
import type { ParsedStorybookEntry } from "@/lib/parseStorybookIndex";

export async function searchStorybookIndex(
  query: string,
  limit = 20,
): Promise<ParsedStorybookEntry[]> {
  return searchStorybookFuzzy(query, limit);
}
