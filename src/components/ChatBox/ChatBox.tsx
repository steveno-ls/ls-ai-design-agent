import React, { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ChatBox.module.css";

interface Message {
  sender: "user" | "ai";
  text: string;
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ node, ...props }) => (
                    <img
                      {...props}
                      style={{
                        maxWidth: "100%",
                        borderRadius: "8px",
                        marginTop: "8px",
                      }}
                      alt="component preview"
                    />
                  ),
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#0070f3",
                        textDecoration: "underline",
                      }}
                    />
                  ),
                }}
              >
                {m.text}
              </ReactMarkdown>
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
