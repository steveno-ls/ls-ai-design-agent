// /lib/loadContentGuidelines.ts
import fs from "fs";
import path from "path";

export function loadContentGuidelines() {
  const dir = path.join(process.cwd(), "src/data/content-writing");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  const guidelines = files.map((file) => {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    return JSON.parse(content);
  });

  // Merge all JSON files into one object
  return Object.assign({}, ...guidelines);
}
