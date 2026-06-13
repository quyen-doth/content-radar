// Orchestrate pipeline 6 bước, fault-tolerant. Xem plan.md §3.

import { isDryRun } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { QiitaCollector } from "./collectors/qiita.ts";
import { filterNew } from "./dedup.ts";
import { summarizeBatch } from "./summarize/gemini.ts";
import { buildDigestMessages, pushDigest } from "./notify/line.ts";
import { readEnabledTopics, readSettings } from "./sheets/config.ts";
import { appendSent, loadSentIds } from "./sheets/history.ts";
import { flushLogs } from "./sheets/logs.ts";

export async function runPipeline(): Promise<void> {
  const dryRun = isDryRun();
  if (dryRun) logger.info("DRY_RUN bật: sẽ KHÔNG push LINE và KHÔNG ghi History.");

  try {
    // 1. Read Config
    const settings = await readSettings();
    const topics = await readEnabledTopics();
    logger.info(`Config: ${topics.length} tag bật, max=${settings.maxItemsPerPush}, lookback=${settings.lookbackDays} ngày (JST), min_likes=${settings.minLikes}`);
    if (topics.length === 0) {
      logger.warn("Không có tag nào đang bật. Kết thúc.");
      return;
    }

    // 2. Collect
    const collector = new QiitaCollector({
      tags: topics.map((t) => t.tagJp),
      lookbackDays: settings.lookbackDays,
      minLikes: settings.minLikes,
      token: process.env.QIITA_TOKEN,
    });
    const collected = await collector.fetch();
    logger.info(`Collect: ${collected.length} bài (sau khử trùng theo id)`);

    // 3. Dedup vs History
    const sentIds = await loadSentIds();
    const fresh = filterNew(collected, sentIds);
    if (fresh.length === 0) {
      logger.info("Không có bài mới. Kết thúc.");
      return;
    }

    // Chọn tối đa N bài chất lượng nhất (likes cao) TRƯỚC khi tóm tắt → tiết kiệm quota.
    const selected = [...fresh]
      .sort((a, b) => b.likes - a.likes)
      .slice(0, settings.maxItemsPerPush);
    logger.info(`Chọn ${selected.length}/${fresh.length} bài để gửi (ưu tiên likes cao)`);

    // 4. Summarize
    await summarizeBatch(selected);

    // 5. Notify
    if (dryRun) {
      logger.info("DRY_RUN — xem trước nội dung digest:");
      for (const msg of buildDigestMessages(selected)) {
        console.log("\n--- LINE message ---\n" + msg);
      }
    } else {
      if (!settings.lineTargetId) {
        throw new Error("line_target_id trống trong tab Settings — không biết gửi cho ai.");
      }
      await pushDigest(settings.lineTargetId, selected);
    }

    // 6. Write History
    if (dryRun) {
      logger.info("DRY_RUN — bỏ qua ghi History.");
    } else {
      await appendSent(selected);
      logger.info(`Đã ghi ${selected.length} bài vào History.`);
    }

    logger.info("✅ Pipeline hoàn tất.");
  } catch (err) {
    logger.error("Pipeline lỗi", err);
    throw err;
  } finally {
    // Ghi Logs vào sheet (chỉ khi chạy thật).
    if (!dryRun) await flushLogs();
  }
}
