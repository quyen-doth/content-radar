// Đọc config từ Sheets: tab Topics (chủ đề/tag) + tab Settings (key-value).
// Xem plan.md §3 bước 1, §4.5.

import type { Settings, Topic } from "../types.ts";
import { getValues } from "./client.ts";

/** Đọc tab Topics → danh sách Topic. Bỏ dòng trống / thiếu tag. */
export async function readTopics(): Promise<Topic[]> {
  const rows = await getValues("Topics!A2:D");
  return rows
    .filter((r) => (r[1] ?? "").trim() !== "") // phải có tag_jp
    .map((r) => ({
      topicId: (r[0] ?? "").trim(),
      tagJp: (r[1] ?? "").trim(),
      enabled: (r[2] ?? "").trim().toUpperCase() === "TRUE",
      note: (r[3] ?? "").trim() || undefined,
    }));
}

/** Chỉ các tag đang bật. */
export async function readEnabledTopics(): Promise<Topic[]> {
  return (await readTopics()).filter((t) => t.enabled);
}

const DEFAULTS = {
  maxItemsPerPush: 5,
  summaryLang: "vi",
  lookbackHours: 24,
  minLikes: 3,
} as const;

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Đọc tab Settings (key-value) → object Settings, áp default khi thiếu. */
export async function readSettings(): Promise<Settings> {
  const rows = await getValues("Settings!A2:B");
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = (r[0] ?? "").trim();
    if (key) map.set(key, (r[1] ?? "").trim());
  }
  return {
    maxItemsPerPush: toInt(map.get("max_items_per_push"), DEFAULTS.maxItemsPerPush),
    summaryLang: map.get("summary_lang") || DEFAULTS.summaryLang,
    lookbackHours: toInt(map.get("lookback_hours"), DEFAULTS.lookbackHours),
    minLikes: toInt(map.get("min_likes"), DEFAULTS.minLikes),
    lineTargetId: map.get("line_target_id") ?? "",
  };
}
