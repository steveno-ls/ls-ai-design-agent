// component/ChatBox/ChatBox.tsx

"use client";

import React, { useRef } from "react";
import styles from "./ChatBox.module.css";
import renderMessageContent from "@/components/ChatBox/renderMessageContent";
import LivePreview from "@/components/ChatBox/LivePreview";

interface Message {
  sender: "user" | "ai";
  text: string;
  data?: {
    livePreviewCode?: string | null;
  };
}

interface ChatBoxProps {
  messages: Message[];
  loading?: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, loading = false }) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.chatBox}>
      {messages.map((m, i) => (
        <div
          key={i}
          className={m.sender === "user" ? styles.userMsg : styles.aiMsg}
        >
          {m.sender === "ai" ? (
            <div className={styles.markdown}>
              {renderMessageContent(m.text)}

              {m.data?.livePreviewCode ? (
                <div className="my-4">
                  <LivePreview code={m.data.livePreviewCode} />
                </div>
              ) : null}
            </div>
          ) : (
            <span>{m.text}</span>
          )}
        </div>
      ))}

      {loading && (
        <div className={styles.aiMsg}>
          <em>Thinking...</em>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
};

export default ChatBox;
