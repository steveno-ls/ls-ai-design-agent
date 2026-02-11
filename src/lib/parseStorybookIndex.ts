// lib/parseStoryBookIndex.ts
export type RawStorybookEntry = {
  id: string;
  title: string;
  type: "docs" | "story";
  name?: string;
  importPath?: string;
};

export type ParsedStorybookEntry = {
  id: string;
  kind: string;
  type: "docs" | "story";
  storyName?: string | null;
  url: string;
  component: string;
  section: string; 
  importPath?: string;
};

export type ParsedStorybookIndex = {
  list: ParsedStorybookEntry[];
  byId: Record<string, ParsedStorybookEntry>;
  byComponent: Record<string, ParsedStorybookEntry[]>;
  bySection: Record<string, ParsedStorybookEntry[]>;
};

export function parseStorybookIndex(
  index: { entries: Record<string, RawStorybookEntry> },
  baseUrl: string
): ParsedStorybookIndex {
  const entries = Object.values(index.entries);

  const list: ParsedStorybookEntry[] = entries.map((entry) => {
    // Split "Components/Button" → ["Components", "Button"]
    const parts = entry.title.split("/");
    const section = parts[0] ?? "";
    const component = parts.slice(1).join("/") || parts[0] || entry.title;

    // Construct a stable Storybook URL for direct linking
    const url = `${baseUrl}/?path=/${entry.type}/${entry.id}`;

    return {
      id: entry.id,
      kind: entry.title,
      type: entry.type,
      storyName: entry.name ?? null,
      url,
      component,
      section,
      importPath: entry.importPath,
    };
  });

  const byId: Record<string, ParsedStorybookEntry> = Object.fromEntries(
    list.map((x) => [x.id, x])
  );

  const byComponent: Record<string, ParsedStorybookEntry[]> = {};
  const bySection: Record<string, ParsedStorybookEntry[]> = {};

  for (const entry of list) {
    if (!byComponent[entry.component]) byComponent[entry.component] = [];
    byComponent[entry.component].push(entry);

    if (!bySection[entry.section]) bySection[entry.section] = [];
    bySection[entry.section].push(entry);
  }

  return { list, byId, byComponent, bySection };
}

export function searchStorybookEntries(
  parsed: ParsedStorybookIndex,
  query: string
): ParsedStorybookEntry[] {
  const q = query.toLowerCase();
  return parsed.list.filter(
    (e) =>
      e.kind.toLowerCase().includes(q) ||
      e.component.toLowerCase().includes(q) ||
      (e.storyName?.toLowerCase().includes(q) ?? false)
  );
}
