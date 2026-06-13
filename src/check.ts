// Công cụ chẩn đoán lớp Sheets (Phase 1): đọc & in Topics + Settings + số dòng History.
// Cần .env đã cấu hình + đã chạy `npm run setup`. Dùng: npm run check
import "dotenv/config";

import { logger } from "./lib/logger.ts";
import { readSettings, readTopics } from "./sheets/config.ts";
import { loadSentIds } from "./sheets/history.ts";

async function main(): Promise<void> {
  logger.info("🔍 Kiểm tra kết nối Sheets...");

  const topics = await readTopics();
  const enabled = topics.filter((t) => t.enabled);
  console.log(`\nTopics: ${topics.length} dòng, ${enabled.length} đang bật`);
  for (const t of topics) {
    console.log(`  ${t.enabled ? "✅" : "⬜"} [${t.topicId}] ${t.tagJp}${t.note ? ` — ${t.note}` : ""}`);
  }

  const settings = await readSettings();
  console.log("\nSettings:");
  console.log(`  max_items_per_push = ${settings.maxItemsPerPush}`);
  console.log(`  lookback_days      = ${settings.lookbackDays}`);
  console.log(`  min_likes          = ${settings.minLikes}`);
  console.log(`  summary_lang       = ${settings.summaryLang}`);
  console.log(`  line_target_id     = ${settings.lineTargetId || "(CHƯA điền!)"}`);

  const sent = await loadSentIds();
  console.log(`\nHistory: ${sent.size} bài đã gửi (dùng để dedup)`);

  if (!settings.lineTargetId) {
    logger.warn("line_target_id đang trống — điền User ID LINE ở tab Settings trước khi chạy thật.");
  }
  console.log("\n✅ Lớp Sheets hoạt động.");
}

main().catch((err) => {
  logger.error("Check lỗi", err);
  process.exit(1);
});
