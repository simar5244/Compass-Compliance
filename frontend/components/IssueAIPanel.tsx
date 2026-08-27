"use client";

import { useEffect, useRef, useState } from "react";
import type { IssueOut } from "@/lib/api";
import { streamIssueAI, AI_LEVELS, type AILevel, type AIMessage } from "@/lib/ai";

const FIRST_MESSAGE = "What is this issue and how do I fix it?";
const SENSITIVE_FIRST_MESSAGE = "Explain this Sensitive Keywords occurrence using Summary, Why it was flagged, How to decide what to do, and Recommended changes.";

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap text-[14px] leading-6 text-black">
      {text.split(/(```[\s\S]*?```)/g).map((part, index) => {
        if (part.startsWith("```")) {
          return (
            <pre key={index} className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-3 font-mono text-xs text-black">
              {part.replace(/^```\w*\n?/, "").replace(/```$/, "")}
            </pre>
          );
        }
        return (
          <span key={index}>
            {part.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
              chunk.startsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : chunk,
            )}
          </span>
        );
      })}
    </div>
  );
}

export function IssueAIPanel({
  issue,
  onClose,
  reportSlug,
  inline = false,
}: {
  issue: IssueOut;
  onClose: () => void;
  reportSlug?: string;
  /** Render in flow (checks table) instead of as the Inspector's right-hand overlay. */
  inline?: boolean;
}) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<AILevel>("moderately_technical");
  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const firstMessage = issue.rule_id === "sensitive_keywords" ? SENSITIVE_FIRST_MESSAGE : FIRST_MESSAGE;

  async function send(content: string, history = messages, atLevel = level) {
    if (!content.trim() || loading || history.length >= 20) return;
    const next = [...history, { role: "user" as const, content: content.trim() }, { role: "assistant" as const, content: "" }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      await streamIssueAI(issue, next.slice(0, -1), (token) => {
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + token };
          return copy;
        });
      }, { reportSlug, level: atLevel });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect to AI — try again");
    } finally {
      setLoading(false);
    }
  }

  const autoSentFor = useRef<string | null>(null);

  useEffect(() => {
    if (autoSentFor.current === issue.id) return;
    autoSentFor.current = issue.id;
    void send(firstMessage, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  useEffect(() => {
    const list = messagesRef.current;
    if (!list) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  function changeLevel(next: AILevel) {
    setLevel(next);
    setMessages([]);
    setError(null);
    void send(firstMessage, [], next);
  }

  const turns = Math.floor(messages.length / 2);

  return (
    <section
      className={`flex flex-col bg-white text-black ${
        inline
          ? "max-h-[32rem] rounded-[3px] border border-[#e5e5e5] shadow-sm"
          : "fixed inset-y-0 right-0 z-50 w-[420px] max-w-[92vw] border-l border-[#e5e5e5] shadow-lg"
      }`}
      aria-label="Ask AI"
    >
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#e5e5e5] px-4 py-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-black">
          <span aria-hidden>✦</span> AI
        </div>
        <label className="ml-auto min-w-0">
          <span className="sr-only">Explanation level</span>
          <select
            value={level}
            onChange={(event) => changeLevel(event.target.value as AILevel)}
            disabled={loading}
            className="w-full min-w-0 max-w-[190px] truncate rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-[7px] text-[13px] font-medium text-black disabled:opacity-60"
          >
            {AI_LEVELS.map((option) => (
              <option key={option.value} value={option.value}>
                Level: {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 flex-none items-center justify-center text-[24px] leading-none text-[#737373] hover:text-black"
          aria-label="Close AI panel"
        >
          ×
        </button>
      </header>

      <div ref={messagesRef} className="mx-4 mb-3 min-h-0 flex-1 overflow-y-auto rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
        {messages.map((message, index) => (
          <div key={index} className="mb-4">
            <div className="mb-1 text-[13px] font-semibold text-[#737373]">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            {message.content ? (
              <Markdown text={message.content} />
            ) : (
              <span className="text-sm text-[#737373]">…</span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 text-xs text-[#525252]">
          Couldn&apos;t connect to AI —{" "}
          <button
            type="button"
            onClick={() => void send(messages[messages.length - 2]?.content ?? firstMessage, messages.slice(0, -2))}
            className="underline"
          >
            try again
          </button>
        </div>
      )}

      <div className="flex-none px-4 pb-4">
        {turns >= 10 ? (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
              void send(firstMessage, []);
            }}
            className="text-[13px] font-semibold text-black underline"
          >
            Start new conversation
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 rounded-[3px] border border-[#e5e5e5] bg-white p-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
              aria-label="Ask a follow-up"
              placeholder="Ask a follow-up…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-black outline-none placeholder:text-[#a3a3a3]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[3px] bg-black text-[16px] text-white disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        )}
        <p className="mt-2 text-[12px] text-[#737373]">Chats are recorded.</p>
      </div>
    </section>
  );
}
