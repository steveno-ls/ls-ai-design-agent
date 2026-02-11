import fs from "fs";
import path from "path";

// 🔧 URL to your Storybook build
const STORYBOOK_BASE_v2 = "https://lightspeed.github.io/unified-components/react";
const STORYBOOK_BASE_V1 = "https://helios.lightspeed.app/storybook";
const INDEX_URL = `${STORYBOOK_BASE_V2}/index.json`;

// 📁 Where to save the local cache
const OUTPUT_PATH = path.resolve("./public/design-system/index.json");

async function main() {
  console.log("📡 Fetching Storybook index from:", INDEX_URL);

  const res = await fetch(INDEX_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Storybook index (status ${res.status})`);
  }

  const data = await res.json();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));

  console.log(`✅ Saved Storybook index to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("❌ Error fetching Storybook index:");
  console.error(err);
  process.exit(1);
});
