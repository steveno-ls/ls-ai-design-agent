import React, { useLayoutEffect, useRef } from "react";
import styles from "./ChatInput.module.css";
import { IconArrowUpward20, IconAttachFile20 } from "@lightspeed/unified-components-helios-theme/react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  loading?: boolean;
}

const MAX_HEIGHT_PX = 160;

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  loading = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "0px"; // reset to measure accurately
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) onSend();
    }
  };

  return (
    <div className={styles.chatInputMain}>
      <div
        className={styles.inputRow}
        onClick={() => textareaRef.current?.focus()}
      >
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Ask anything about Lightspeed design..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className={styles.actionContainer}>
          <button
            disabled={true}
            className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonDisabled}`}
            aria-label="attach"
            type="button"
          >
            <IconAttachFile20 />
            Attach
          </button>
          <button
            onClick={onSend}
            disabled={loading || !value.trim()}
            className={`${styles.button} ${styles.buttonPrimary} ${!value.trim() && styles.buttonDisabled}`}
            aria-label="Send"
            type="button"
          >
            <IconArrowUpward20 />
            Send
          </button>
        </div>
      </div>
      <p className={styles.footer}>
        This AI agent is here to assist you. If you notice any errors, please
        let us know!
      </p>
      <div className={styles.footerFog}></div>
    </div>
  );
};

export default ChatInput;
