"use client";
import React, { useState, useRef, useEffect } from "react";
import ChatBox from "@/components/ChatBox/ChatBox";
import ChatInput from "@/components/ChatInput/ChatInput";
import styles from "./page.module.css";

interface Message {
  sender: "user" | "ai";
  text: string;
  data?: {
    name?: string;
    figmaUrl?: string;
    storybookUrl?: string;
    preview?: string;
    section?: string;
  };
}

type Mode = "system" | "design" | "content";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("system");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({
          message: newMessage.text,
          mode, // 👈 send the mode
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { sender: "ai", text: data.reply || "No response." },
      ]);
    } catch (e) {
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
      <div className={styles.container}>
        <div className={styles.content}>
          <ChatBox messages={messages} loading={loading} />
        </div>
        <div className={styles.inputContainer}>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => handleSend()}
            loading={loading}
            activeTab={mode}
            setActiveTab={setMode}
          />
        </div>
      </div>
    </main>
  );
}
