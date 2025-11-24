export async function getStorybookIndex() {
  const res = await fetch(
    "https://lightspeed.github.io/unified-components/react/index.json"
  );
  if (!res.ok) throw new Error("Failed to fetch Storybook index");
  return res.json();
}