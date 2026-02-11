"use client";
import React, { useState, useRef, useEffect } from "react";
import ChatBox from "@/components/ChatBox/ChatBox";
import ChatInput from "@/components/ChatInput/ChatInput";
import styles from "./page.module.css";

interface Message {
  sender: "user" | "ai";
  text: string;
  data?: {
    componentName?: string;
    summary?: string;
    usage?: string;
    livePreviewCode?: string | null;
    links?: {
      figma?: string | null;
      docs?: string | null;
      storybook?: string | null;
    };
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const hasStarted = messages.length > 0;

  useEffect(() => {
    if (!hasStarted) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, hasStarted]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { sender: "user", text: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage.text }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: data.reply || "No response.",
          data: data.data, // ✅ includes livePreviewCode + links + etc
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: "⚠️ Something went wrong. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={hasStarted ? styles.chatShell : styles.landingShell}>
        {!hasStarted ? (
          // Landing (centered)
          <div className={styles.landing}>
            <img src="/helios.svg" alt="Helios logo" className={styles.logo} />

            <div className={styles.landingInput}>
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                loading={loading}
              />
            </div>
          </div>
        ) : (
          // Chat (input pinned bottom)
          <>
            <div className={styles.chatBody}>
              <ChatBox messages={messages} loading={loading} />
              <div ref={chatEndRef} />
            </div>

            <div className={styles.chatFooter}>
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                loading={loading}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
