// Thu thập bài mới từ Qiita theo tag. Implement interface Collector. Xem plan.md §4.2.
//
// Lưu ý: dùng `likes_count` (LGTM) để lọc chất lượng vì Qiita API v2 KHÔNG trả
// stocks_count công khai. Xem plan.md §0.

import type { Article, Collector } from "../types.ts";
import { logger } from "../lib/logger.ts";
import { cutoffFromDays, queryDateForCutoff } from "../lib/time.ts";

const QIITA_API = "https://qiita.com/api/v2/items";
const PER_PAGE = 100; // Qiita max; cửa sổ nhiều ngày dễ >20 bài/tag nên lấy rộng rồi lọc client-side

interface QiitaItem {
  id: string;
  title: string;
  url: string;
  created_at: string;
  likes_count: number;
  body: string;
  tags: { name: string }[];
}

export interface QiitaCollectorOptions {
  tags: string[]; // danh sách tag_jp đang bật
  lookbackDays: number; // cửa sổ theo lịch ngày, mốc 00:00 JST
  minLikes: number;
  token?: string; // tuỳ chọn: có token thì rate limit cao hơn (~1000/h)
}

export class QiitaCollector implements Collector {
  constructor(private readonly opts: QiitaCollectorOptions) {}

  async fetch(): Promise<Article[]> {
    const cutoff = cutoffFromDays(this.opts.lookbackDays);
    const sinceDate = queryDateForCutoff(cutoff);
    const byId = new Map<string, Article>(); // khử trùng theo id (bài có thể trúng nhiều tag)

    for (const tag of this.opts.tags) {
      try {
        const items = await this.fetchTag(tag, sinceDate);
        let kept = 0;
        for (const item of items) {
          // Lọc client-side: created_at >= cutoff (00:00 JST) VÀ đủ likes.
          if (new Date(item.created_at).getTime() < cutoff.getTime()) continue;
          if (item.likes_count < this.opts.minLikes) continue;
          if (!byId.has(item.id)) {
            byId.set(item.id, this.toArticle(item, tag));
            kept++;
          }
        }
        logger.info(`Qiita tag "${tag}": ${items.length} bài thô → ${kept} bài giữ lại`);
      } catch (err) {
        // Lỗi 1 tag không làm hỏng cả run.
        logger.error(`Qiita tag "${tag}" lỗi`, err);
      }
    }

    return [...byId.values()];
  }

  private async fetchTag(tag: string, sinceDate: string): Promise<QiitaItem[]> {
    const query = `tag:${tag} created:>=${sinceDate}`;
    const url = `${QIITA_API}?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=1`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.opts.token) headers["Authorization"] = `Bearer ${this.opts.token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const remaining = res.headers.get("Rate-Remaining");
    if (remaining && Number(remaining) < 20) {
      logger.warn(`Qiita rate limit còn thấp: ${remaining}`);
    }
    return (await res.json()) as QiitaItem[];
  }

  private toArticle(item: QiitaItem, matchedTag: string): Article {
    return {
      id: item.id,
      tag: matchedTag,
      titleJp: item.title,
      url: item.url,
      publishedAt: item.created_at,
      likes: item.likes_count,
      body: item.body ?? "",
    };
  }
}
