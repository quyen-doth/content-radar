// Dedup vs History: bỏ bài đã từng gửi. Xem plan.md §3 bước 3.

import type { Article } from "./types.ts";
import { logger } from "./lib/logger.ts";

/** Giữ lại các bài có id chưa nằm trong tập đã gửi. */
export function filterNew(articles: Article[], sentIds: Set<string>): Article[] {
  const fresh = articles.filter((a) => !sentIds.has(a.id));
  logger.info(`Dedup: ${articles.length} bài → ${fresh.length} bài mới (đã loại ${articles.length - fresh.length} trùng)`);
  return fresh;
}
