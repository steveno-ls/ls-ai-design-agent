// components/ChatBox/renderMessageContent.tsx
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ReferenceTag from "@/components/ReferenceTag/ReferenceTag";
import LivePreview from "@/components/ChatBox/LivePreview";
import styles from "./ChatBox.module.css";

const renderMessageContent = (text: string) => {
  const refBlockRegex =
    /<ComponentReferences>([\s\S]*?)<\/ComponentReferences>/g;
  const refTagRegex =
    /<ReferenceTag type="(.*?)" label="(.*?)" href="(.*?)" \/>/g;
  const previewBlockRegex =
    /<LivePreview\s+code={(["'`])([\s\S]*?)\1\s*} ?\/>/g;

  type Segment =
    | { type: "text"; content: string }
    | { type: "refs"; refs: { type: string; label: string; href: string }[] }
    | { type: "preview"; code: string };

  const segments: Segment[] = [];
  let lastIndex = 0;

  const allMatches = [
    ...Array.from(text.matchAll(refBlockRegex)).map((m) => ({
      ...m,
      kind: "refs",
    })),
    ...Array.from(text.matchAll(previewBlockRegex)).map((m) => ({
      ...m,
      kind: "preview",
    })),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const match of allMatches) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }

    if (match.kind === "refs") {
      const blockContent = (match as any)[1] as string;
      const refs = Array.from(blockContent.matchAll(refTagRegex)).map(
        ([, type, label, href]) => ({ type, label, href })
      );
      segments.push({ type: "refs", refs });
    } else if (match.kind === "preview") {
      const code = ((match as any)[2] as string).trim();
      segments.push({ type: "preview", code });
    }

    lastIndex = (match.index ?? 0) + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  // 🧠 Now render everything properly
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          // Render normal markdown (text only)
          return (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {seg.content.trim()}
            </ReactMarkdown>
          );
        }

        if (seg.type === "refs") {
          return (
            <div key={i} className="mt-4">
              <div className={styles.referenceContainer}>
                {seg.refs.map((r, idx) => (
                  <ReferenceTag
                    key={idx}
                    type={r.type as any}
                    label={r.label}
                    href={r.href}
                  />
                ))}
              </div>
            </div>
          );
        }

        if (seg.type === "preview") {
          // 🪄 Render LivePreview as a React component (not markdown)
          return (
            <div key={i} className="my-4">
              <LivePreview code={seg.code} />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

export default renderMessageContent;
