import React, { useState } from "react";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  loading?: boolean;
  activeTab: "system" | "design" | "content";
  setActiveTab: (tab: "system" | "design" | "content") => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  loading = false,
  activeTab,
  setActiveTab,
}) => {
  return (
    <div className={styles.chatInputContainer}>
      {/* --- Tabs --- */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${
            activeTab === "system" ? styles.activeSystem : ""
          }`}
          onClick={() => setActiveTab("system")}
        >
          System
        </button>
        <button
          className={`${styles.tab} ${
            activeTab === "design" ? styles.activeDesign : ""
          }`}
          onClick={() => setActiveTab("design")}
        >
          UI Design
        </button>
        <button
          className={`${styles.tab} ${
            activeTab === "content" ? styles.activeContent : ""
          }`}
          onClick={() => setActiveTab("content")}
        >
          Content
        </button>
      </div>

      {/* --- Input Row --- */}
      <div
        className={`${styles.inputRow} ${
          activeTab === "system"
            ? styles.activeInputSystem
            : activeTab === "design"
            ? styles.activeInputDesign
            : styles.activeInputContent
        }`}
      >
        <input
          className={styles.input}
          placeholder={`Ask about ${
            activeTab === "system"
              ? "Helios design system"
              : activeTab === "design"
              ? "UI design assistance"
              : "content writing"
          }...`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
        />

        <button
          onClick={onSend}
          disabled={loading || !value.trim()}
          className={`${value ? styles.sendButton : styles.sendButtonHide} ${
            activeTab === "system"
              ? styles.system
              : activeTab === "design"
              ? styles.design
              : styles.content
          }`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.37501 6.14415L5.0673 10.4519C4.94341 10.5757 4.79841 10.6369 4.6323 10.6354C4.46619 10.6337 4.31848 10.5683 4.18917 10.4391C4.06848 10.3098 4.00598 10.1635 4.00167 9.99998C3.99737 9.83651 4.05987 9.69012 4.18917 9.56081L9.47271 4.27727C9.55077 4.19922 9.63306 4.14422 9.71959 4.11227C9.80612 4.08019 9.89959 4.06415 10 4.06415C10.1004 4.06415 10.1939 4.08019 10.2804 4.11227C10.367 4.14422 10.4492 4.19922 10.5273 4.27727L15.8108 9.56081C15.9263 9.67623 15.9853 9.81915 15.9879 9.98956C15.9906 10.16 15.9315 10.3098 15.8108 10.4391C15.6815 10.5683 15.5331 10.6329 15.3654 10.6329C15.1976 10.6329 15.0491 10.5683 14.9198 10.4391L10.625 6.14415V15.625C10.625 15.8023 10.5651 15.9508 10.4454 16.0704C10.3258 16.1901 10.1774 16.25 10 16.25C9.82265 16.25 9.67417 16.1901 9.55459 16.0704C9.43487 15.9508 9.37501 15.8023 9.37501 15.625V6.14415Z"
              fill="white"
            />
          </svg>
        </button>
      </div>

      <p className={styles.footer}>This AI Agent can make mistakes</p>
    </div>
  );
};

export default ChatInput;
