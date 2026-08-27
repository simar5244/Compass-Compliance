import type { IssueOut } from "@/lib/api";
import { API_BASE } from "@/lib/api-base";

const API_URL = API_BASE;
export type AIMessage = { role: "user" | "assistant"; content: string };

/** How technical the explanation should be. The backend turns this into prompt guidance. */
export const AI_LEVELS = [
  { value: "non_technical", label: "Non-technical" },
  { value: "moderately_technical", label: "Moderately technical" },
  { value: "highly_technical", label: "Highly technical" },
] as const;

export type AILevel = (typeof AI_LEVELS)[number]["value"];

export async function streamIssueAI(
  issue: IssueOut,
  messages: AIMessage[],
  onToken: (token: string) => void,
  options: { reportSlug?: string; level?: AILevel } = {},
): Promise<void> {
  const { reportSlug, level } = options;
  const isInstant = !!reportSlug;
  // The "/api/ai" segment is not a typo: unlike every other backend route,
  // FastAPI mounts the AI endpoints under /api/ai. The proxy strips the leading
  // /compass/api, so this resolves to the backend's /api/ai/... path.
  const response = await fetch(`${API_URL}/api/ai/${isInstant ? "instant-issue-explain" : "issue-explain"}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issue_id: issue.id,
      messages,
      ...(level ? { level } : {}),
      ...(reportSlug ? { report_slug: reportSlug } : {}),
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error("AI request failed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as { token?: string; error?: string };
      if (payload.error) throw new Error(payload.error);
      if (payload.token) onToken(payload.token);
    }
    if (done) break;
  }
}
