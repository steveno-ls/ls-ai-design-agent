export const runtime = "nodejs";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { findBestComponent, listCloseComponents } from "@/lib/search";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Simple in-memory conversation sessions
const sessions: Record<string, any[]> = {};

// --- Helper: Load and merge all Helios content JSON guidelines ---
function loadContentGuidelines() {
  const dir = path.join(process.cwd(), "src/data/content-writing");
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const merged = files.map((file) =>
    JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
  );
  return Object.assign({}, ...merged);
}

// --- Main Chat Route ---
export async function POST(req: Request) {
  const { message, mode = "system" } = await req.json();

  // Retrieve conversation history (in-memory session)
  const sessionId = "default"; // Replace with user/session id if needed
  const history = sessions[sessionId] || [];

  // 🟣 Mode: Content writing -------------------------------------------
  if (mode === "content") {
    const contentGuidelines = loadContentGuidelines();

    const systemPrompt = `
You are a senior Lightspeed content designer following the official **Helios Content Guidelines**.
You must always apply them **strictly and explicitly**.

### Your required workflow:
1. **Read and memorize** the Helios Content Guidelines below.
2. When the user provides content or asks for new content:
   - Evaluate it *against* the Helios tone, grammar, and structure.
   - Identify exactly which rules from the guidelines apply.
   - Explain *why* something does or does not fit the guidelines.
   - If rewriting, show the improved version **and** the reasoning.

### Helios Content Guidelines
${JSON.stringify(contentGuidelines, null, 2)}

Your response format:
- **Feedback summary**
- **Revised content (if applicable)**
- **Reasoning referencing the guidelines**
`;
    console.log("🟣 Sending systemPrompt:", systemPrompt);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content ?? "No response.";
    return NextResponse.json({ reply });
  }

  // 🟢 Mode: System or Design ------------------------------------------
  let modePrompt = "";

  if (mode === "system") {
    modePrompt = `You are an expert on the Lightspeed Helios Design System. 
Reference tokens, components, and patterns when answering.
Prefer factual, concise answers that cite Helios documentation, Storybook, or Figma sources.`;
  } else if (mode === "design") {
    modePrompt = `You are a senior product designer.
Provide UI feedback and design reasoning based on Helios docs and Storybook.
Only propose new components when none fit the design intent.`;
  }

  // --- Helper tools -------------------------------------------------

  async function findFigmaComponent(query: string) {
    const best = await findBestComponent(query);
    if (best) {
      const url =
        best.figmaUrl ||
        `https://www.figma.com/file/${
          best.fileKey
        }?node-id=${encodeURIComponent(best.id || best.nodeId)}`;

      return {
        name: best.name,
        page: best.page,
        frame: best.frame,
        url,
        image: best.imageUrl || null,
      };
    }

    const close = (await listCloseComponents(query, 3)).map((c) => c.name);
    return { suggestions: close };
  }

  async function searchDesignSystemTool(query: string) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/design-system/search?q=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    const data = await res.json();

    if (!data.results?.length) {
      return { message: `No matching components found for "${query}".` };
    }

    const formatted = data.results
      .slice(0, 5)
      .map((r: any) => `- [${r.kind}](${r.url}) (${r.type})`)
      .join("\n");

    return { message: `**Results for "${query}"**\n${formatted}` };
  }

  async function findComponentDetails(query: string) {
    const figma = await findFigmaComponent(query);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const storybookRes = await fetch(
      `${baseUrl}/api/design-system/search?q=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    const storybookData = await storybookRes.json();
    const storybook = storybookData.results?.[0];

    const response = {
      name: figma?.name || storybook?.component || query,
      figmaUrl: figma?.url || null,
      storybookUrl: storybook?.url || null,
      preview: figma?.image || null,
      section: storybook?.section || null,
      message: `
**${figma?.name || storybook?.component || query}**

${figma?.page ? `**Figma page:** ${figma.page}` : ""}
${storybook ? `**Storybook section:** ${storybook.kind}` : ""}

🔗 [Open in Figma](${figma?.url})  
📘 [Open in Storybook](${storybook?.url})
`,
    };

    return response;
  }

  // --- Core model reasoning ----------------------------------------

  const systemPrompt = `
${modePrompt}

You can:
- Use "findFigmaComponent" to locate Figma components by name.
- Use "searchDesignSystemTool" to look up docs or components in Storybook.
- Use "findComponentDetails" to return summaries with links.
Always respond in Markdown for readable formatting.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "findFigmaComponent",
          description:
            "Find and describe a Figma component by name or keyword.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Component name or keyword.",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "searchDesignSystemTool",
          description:
            "Search for components or docs in the Storybook Design System.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Component name or keyword (e.g. 'Button', 'Badge').",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "findComponentDetails",
          description:
            "Fetch combined details for a component, including Figma and Storybook links.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Component name or keyword.",
              },
            },
            required: ["query"],
          },
        },
      },
    ],
  });

  const msg = completion.choices[0].message;

  // --- If model decided to call a tool ------------------------------
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const tool = msg.tool_calls[0];

    const name =
      (tool as any).function?.name ||
      (tool as any).function_call?.name ||
      (tool as any).name;

    const args =
      (tool as any).function?.arguments ||
      (tool as any).function_call?.arguments ||
      (tool as any).arguments;

    let result: any = null;

    if (!name) {
      console.error("⚠️ Tool call missing function name:", tool);
      return NextResponse.json({ reply: "Invalid tool call." });
    }

    try {
      const parsed = JSON.parse(args || "{}");
      if (name === "findFigmaComponent") {
        result = await findFigmaComponent(parsed.query);
      } else if (name === "searchDesignSystemTool") {
        result = await searchDesignSystemTool(parsed.query);
      } else if (name === "findComponentDetails") {
        result = await findComponentDetails(parsed.query);
      }
    } catch (err) {
      console.error("Tool call error:", err);
    }

    const followUp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
        msg,
        {
          role: "tool",
          tool_call_id: (tool as any).id,
          content: JSON.stringify(result),
        },
      ],
    });

    const reply = followUp.choices[0].message?.content || "No response.";

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    return NextResponse.json({ reply });
  }

  // --- No tool used, just return model reply ------------------------
  const reply = msg?.content || "No response.";
  history.push({ role: "user", content: message });
  history.push({ role: "assistant", content: reply });

  sessions[sessionId] = history;
  return NextResponse.json({ reply });
}
