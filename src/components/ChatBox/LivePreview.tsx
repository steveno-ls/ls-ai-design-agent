// components/ChatBox/LivePreview.tsx
"use client";

import React from "react";
import * as Helios from "@lightspeed/unified-components-helios-theme/react";
import styles from "./livePreview.module.css";
import { LiveProvider, LiveError, LivePreview as Live } from "react-live";

interface LivePreviewProps {
  code?: string;
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-red-600 p-2 bg-red-50 rounded-md">
          Runtime error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function LivePreview({ code }: LivePreviewProps) {
  const actual = (code ?? "").trim();

  const program =
    actual.startsWith("render(") || actual.includes("\nrender(")
      ? actual
      : actual.startsWith("<")
        ? `render(${actual})`
        : `render(<React.Fragment>${actual}</React.Fragment>)`;

  const scope = {
    React,
    ...Helios,
    render: (element: React.ReactElement) => element,
  };

  return (
    <div className={styles.previewContainer}>
      <PreviewErrorBoundary>
        <LiveProvider code={program} scope={scope} noInline>
          <Live className="p-2" />
          <LiveError className="text-red-600 p-2 bg-red-50 rounded-md mt-2" />
        </LiveProvider>
      </PreviewErrorBoundary>
    </div>
  );
}