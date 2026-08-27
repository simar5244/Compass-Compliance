import type { CheckSeverity } from "./InspectorSidebar";
import type { IssueOut } from "@/lib/api";

export function parseIssuePayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function firstPayloadText(payload: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value);
    }
  }
  return null;
}

export function relevantSnippet(issue: IssueOut): string | null {
  const raw = issue.html_snippet?.trim();
  if (!raw) return null;
  const payload = parseIssuePayload(raw);
  if (!payload) return raw;

  if (issue.rule_id.toLowerCase().includes("broken")) {
    return firstPayloadText(payload, ["url"]);
  }
  if (issue.rule_id === "spelling" || issue.rule_id === "grammar") {
    return firstPayloadText(payload, ["error_text", "word", "excerpt", "text", "message"]);
  }
  return firstPayloadText(payload, [
    "html",
    "snippet",
    "html_snippet",
    "outer_html",
    "element",
    "error_text",
    "url",
    "excerpt",
    "text",
    "message",
  ]);
}

export function severityPresentation(issue: IssueOut, fallback: CheckSeverity) {
  const impact = issue.impact;
  if (impact === "critical") return { label: "Critical", color: "#000000" };
  if (impact === "serious") return { label: "Serious", color: "#000000" };
  if (impact === "moderate") return { label: "Moderate", color: "#525252" };
  if (impact === "minor") return { label: "Minor", color: "#737373" };
  if (fallback === "error") return { label: "Serious", color: "#000000" };
  if (fallback === "warning") return { label: "Warning", color: "#525252" };
  return { label: "Minor", color: "#737373" };
}
