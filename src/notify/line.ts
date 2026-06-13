// Đẩy digest qua LINE Messaging API (push). Gom nhiều bài vào ít message nhất.
// Xem plan.md §4.4.

import type { Article } from "../types.ts";
import { requireEnv } from "../config.ts";
import { logger } from "../lib/logger.ts";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const TEXT_LIMIT = 4900; // LINE giới hạn 5000 ký tự/text — chừa biên an toàn
const MAX_MESSAGES = 5; // 1 push tối đa 5 message object

/** Định dạng 1 bài (PRD §7.4, đổi ⭐stocks → 👍likes). */
export function formatArticle(a: Article): string {
  return [
    `📌 ${a.titleJp}`,
    `📝 ${a.summaryVi ?? ""}`,
    `🔗 ${a.url}`,
    `👍 ${a.likes} likes`,
  ].join("\n");
}

/** Gom các bài thành tối đa MAX_MESSAGES text, mỗi text ≤ TEXT_LIMIT ký tự. */
export function buildDigestMessages(articles: Article[]): string[] {
  const header = `🗞 Qiita digest — ${articles.length} bài mới`;
  const blocks = articles.map(formatArticle);

  const messages: string[] = [];
  let current = header;
  for (const block of blocks) {
    const candidate = `${current}\n\n${block}`;
    if (candidate.length > TEXT_LIMIT) {
      messages.push(current);
      current = block; // bài này mở message mới
    } else {
      current = candidate;
    }
  }
  if (current) messages.push(current);

  if (messages.length > MAX_MESSAGES) {
    logger.warn(`Digest cần ${messages.length} message > ${MAX_MESSAGES}, cắt bớt phần dư`);
    return messages.slice(0, MAX_MESSAGES);
  }
  return messages;
}

/** Push digest tới 1 user. Ném lỗi nếu LINE trả non-2xx. */
export async function pushDigest(to: string, articles: Article[]): Promise<void> {
  if (articles.length === 0) return;
  const token = requireEnv("LINE_CHANNEL_ACCESS_TOKEN");
  const messages = buildDigestMessages(articles).map((text) => ({ type: "text", text }));

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE push HTTP ${res.status}: ${detail}`);
  }
  logger.info(`Đã push ${messages.length} message LINE (${articles.length} bài)`);
}
