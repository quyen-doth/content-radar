// Tab History: nguồn dedup + lưu bài đã gửi. Xem plan.md §3 bước 3 & 6, §4.5.

import type { Article } from "../types.ts";
import { appendValues, getValues } from "./client.ts";

/** Load tập article_id đã từng gửi (cột A) để dedup. */
export async function loadSentIds(): Promise<Set<string>> {
  const rows = await getValues("History!A2:A");
  const ids = new Set<string>();
  for (const r of rows) {
    const id = (r[0] ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

/** Append các bài đã gửi vào History (status = sent). */
export async function appendSent(articles: Article[]): Promise<void> {
  if (articles.length === 0) return;
  const sentAt = new Date().toISOString();
  const rows = articles.map((a) => [
    a.id,
    a.tag,
    a.titleJp,
    a.url,
    a.publishedAt,
    a.likes,
    a.summaryVi ?? "",
    sentAt,
    "sent",
  ]);
  await appendValues("History!A:I", rows);
}
