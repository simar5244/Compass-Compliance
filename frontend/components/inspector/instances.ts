import type { IssueOut } from "@/lib/api";
import { parseIssuePayload, relevantSnippet } from "./issueDetail";

/** How an instance's body is presented: an element snippet, the whole page, or a media preview. */
export type InstanceKind = "element" | "page" | "media";

export interface InspectorInstance {
  key: string;
  /** The issue this row belongs to. Repeated occurrences share one issue per entry in `occurrences`. */
  issue: IssueOut;
  kind: InstanceKind;
  label: string;
  /** True when the label is markup and should render monospaced. */
  labelIsCode: boolean;
  snippet: string | null;
  imageUrl: string | null;
  message: string;
  /** Every issue row collapsed into this instance. Length drives the count badge and the pager. */
  occurrences: IssueOut[];
}

const WHOLE_PAGE_LABEL = "Whole HTML page";

const IMAGE_EXTENSION = /\.(png|svg|ico|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i;

/**
 * Keys a check's payload may use to name a row, most specific first. Checks emit
 * whatever suits them, so we probe generically rather than switching on rule_id.
 */
const LABEL_KEYS = [
  "href", "url", "src", "action", "name", "label", "title", "text",
  "matched_text", "error_text", "word", "message", "selector",
];

/** Keys that describe an entry rather than name it — used only for a fallback label. */
const DESCRIPTIVE_KEY_LIMIT = 2;

/** Trailing path segment, so `/assets/favicon-96.png?v=2` reads as `favicon-96.png`. */
function basename(value: string): string {
  try {
    const parsed = new URL(value, "https://relative.invalid");
    return parsed.pathname.split("/").filter(Boolean).pop() || value;
  } catch {
    return value;
  }
}

/** Resolve a possibly-relative asset reference against the scanned page's URL. */
export function resolveAssetUrl(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function payloadString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Checks that inventory several things at once (favicons, cookies, requests…) emit a
 * single issue whose payload holds an array of objects. The Inspector shows one row
 * per entry, so expand any such array into rows. Returns null for scalar payloads.
 */
export function expandPayloadRows(issue: IssueOut): Record<string, unknown>[] | null {
  const payload = parseIssuePayload(issue.html_snippet);
  if (!payload) return null;
  for (const value of Object.values(payload)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
    ) {
      return value as Record<string, unknown>[];
    }
  }
  return null;
}

function rowLabel(row: Record<string, unknown>, fallback: string): { label: string; source: string | null } {
  for (const key of LABEL_KEYS) {
    const value = payloadString(row, key);
    if (!value) continue;
    // Asset paths read better as a filename; a page URL is more useful in full.
    return { label: IMAGE_EXTENSION.test(value) ? basename(value) : value, source: value };
  }

  // Nothing named the entry, so describe it from its own fields rather than
  // falling back to a meaningless ordinal.
  const described = Object.entries(row)
    .filter(([, value]) => (typeof value === "string" || typeof value === "number") && String(value).trim())
    .slice(0, DESCRIPTIVE_KEY_LIMIT)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
  return { label: described || fallback, source: null };
}

function instanceFromPayloadRow(
  issue: IssueOut,
  row: Record<string, unknown>,
  index: number,
  pageUrl: string,
): InspectorInstance {
  const { label, source } = rowLabel(row, `Item ${index + 1}`);
  const isImage = !!source && IMAGE_EXTENSION.test(source);
  return {
    key: `${issue.id}:${index}`,
    issue,
    kind: isImage ? "media" : "element",
    label,
    labelIsCode: label.startsWith("<"),
    snippet: isImage ? null : JSON.stringify(row, null, 2),
    imageUrl: isImage && source ? resolveAssetUrl(source, pageUrl) : null,
    message: issue.description,
    occurrences: [issue],
  };
}

/**
 * Some findings carry an HTTP status in their payload (link checks). Surface it with
 * the response codes that commonly mean "bot blocked", not "actually broken".
 */
const SOFT_FAILURE_STATUSES = new Set([403, 429, 999]);

function withHttpContext(issue: IssueOut, message: string): string {
  const status = parseIssuePayload(issue.html_snippet)?.http_status;
  if (typeof status !== "number") return message;
  const parts = [message, `HTTP ${status}.`];
  if (SOFT_FAILURE_STATUSES.has(status)) {
    parts.push("Some sites block automated checks, so verify this one in a browser.");
  }
  return parts.filter(Boolean).join(" ");
}

function instanceFromIssue(issue: IssueOut): InspectorInstance {
  const snippet = relevantSnippet(issue);
  const isPageLevel = !issue.bbox && !issue.selector;

  if (isPageLevel) {
    // A page-level finding is normally about the page as a whole, but some carry
    // their own subject in the payload (a link URL, a resource name). Name the row
    // after that subject when there is one so sibling rows stay distinguishable.
    const payload = parseIssuePayload(issue.html_snippet);
    const subject = payload ? rowLabel(payload, "").label : "";
    return {
      key: issue.id,
      issue,
      kind: "page",
      label: subject || WHOLE_PAGE_LABEL,
      labelIsCode: subject.trimStart().startsWith("<"),
      snippet: null,
      imageUrl: null,
      // The finding itself is the explanation for a page-level check.
      message: withHttpContext(issue, issue.description || "This issue applies to the whole of this HTML page."),
      occurrences: [issue],
    };
  }

  // For element findings the engine's description names the failure and the
  // remediation explains it, which mirrors how the row/body split reads.
  const label = issue.description || snippet || issue.selector || issue.display_name;
  return {
    key: issue.id,
    issue,
    kind: "element",
    label,
    labelIsCode: label.trimStart().startsWith("<"),
    snippet,
    imageUrl: null,
    message: withHttpContext(issue, issue.remediation || issue.check_description),
    occurrences: [issue],
  };
}

/**
 * Collapse identical findings into one row. Two findings group only when the same
 * check produced the same label, markup and payload, so four distinct offending
 * elements that share a message stay on four rows with their own counts — while one
 * element flagged 17 times collapses to a single row of 17.
 */
function groupKey(instance: InspectorInstance): string {
  return [
    instance.issue.rule_id,
    instance.kind,
    instance.label,
    instance.snippet ?? "",
    instance.imageUrl ?? "",
  ].join("|");
}

/** Build the Inspector's instance rows for one check, in the order the engine reported them. */
export function buildInstances(issues: IssueOut[], pageUrl: string): InspectorInstance[] {
  const expanded: InspectorInstance[] = [];
  for (const issue of issues) {
    const rows = expandPayloadRows(issue);
    if (rows) {
      rows.forEach((row, index) => expanded.push(instanceFromPayloadRow(issue, row, index, pageUrl)));
    } else {
      expanded.push(instanceFromIssue(issue));
    }
  }

  // "Whole HTML page" is the right name when a check reports the page once. When a
  // check reports several page-level findings (each detected technology, each
  // tracker), name every row after its own finding so they stay distinguishable.
  const pageLevelPerRule = new Map<string, number>();
  for (const instance of expanded) {
    if (instance.kind !== "page") continue;
    pageLevelPerRule.set(instance.issue.rule_id, (pageLevelPerRule.get(instance.issue.rule_id) ?? 0) + 1);
  }
  for (const instance of expanded) {
    if (instance.kind !== "page" || (pageLevelPerRule.get(instance.issue.rule_id) ?? 0) < 2) continue;
    // A payload that already named the row (a URL, a resource) wins over the description.
    if (instance.label !== WHOLE_PAGE_LABEL) continue;
    const named = instance.issue.description || relevantSnippet(instance.issue);
    if (!named) continue;
    instance.label = named;
    instance.labelIsCode = named.trimStart().startsWith("<");
    instance.message = withHttpContext(instance.issue, instance.issue.remediation || instance.issue.check_description);
  }

  const grouped = new Map<string, InspectorInstance>();
  for (const instance of expanded) {
    const key = groupKey(instance);
    const existing = grouped.get(key);
    if (existing) existing.occurrences.push(...instance.occurrences);
    else grouped.set(key, instance);
  }
  return [...grouped.values()];
}
