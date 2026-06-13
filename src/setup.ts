// Bootstrap Google Sheet: tạo tab còn thiếu, ghi header, seed Topics/Settings mặc định.
// Chạy 1 lần sau khi đã tạo spreadsheet + share cho service account:
//   bun run src/setup.ts
// An toàn khi chạy lại: chỉ tạo tab thiếu và chỉ seed khi tab đang trống (chỉ có header).
// Xem plan.md §0, §6.

import "dotenv/config"; // nạp biến từ .env (tsx không tự nạp)
import {
  createTabs,
  getValues,
  listTabTitles,
  updateValues,
} from "./sheets/client.ts";

const HEADERS: Record<string, string[]> = {
  Topics: ["topic_id", "tag_jp", "enabled", "note"],
  Settings: ["key", "value"],
  History: [
    "article_id",
    "tag",
    "title_jp",
    "url",
    "published_at",
    "likes",
    "summary_vi",
    "sent_at",
    "status",
  ],
  Logs: ["timestamp", "level", "message"],
};

// Bộ tag khởi tạo (PRD §6 + §12). enabled ~5-6 tag để tránh quá nhiều bài.
const SEED_TOPICS: string[][] = [
  ["t1", "生成AI", "TRUE", "AI tạo sinh"],
  ["t2", "AI活用", "TRUE", "Ứng dụng AI"],
  ["t3", "業務効率化", "TRUE", "Tối ưu công việc"],
  ["t4", "LLM", "TRUE", ""],
  ["t5", "RAG", "TRUE", ""],
  ["t6", "機械学習", "FALSE", "tắt tạm"],
];

// Settings mặc định. line_target_id để trống — bạn tự điền User ID sau.
const SEED_SETTINGS: string[][] = [
  ["max_items_per_push", "5"],
  ["summary_lang", "vi"],
  ["lookback_days", "5"],
  ["min_likes", "3"],
  ["line_target_id", ""],
];

const COLUMN_END: Record<string, string> = {
  Topics: "D",
  Settings: "B",
  History: "I",
  Logs: "C",
};

async function ensureHeader(tab: string): Promise<void> {
  const header = HEADERS[tab];
  const end = COLUMN_END[tab];
  const existing = await getValues(`${tab}!A1:${end}1`);
  if (existing.length === 0 || existing[0]?.length === 0) {
    await updateValues(`${tab}!A1:${end}1`, [header]);
    console.log(`  ✓ Ghi header cho tab "${tab}"`);
  } else {
    console.log(`  • Tab "${tab}" đã có header, bỏ qua`);
  }
}

/** Seed dữ liệu nếu tab chỉ mới có header (chưa có dòng dữ liệu). */
async function seedIfEmpty(
  tab: string,
  rows: string[][],
): Promise<void> {
  const end = COLUMN_END[tab];
  const data = await getValues(`${tab}!A2:${end}`);
  if (data.length === 0) {
    await updateValues(`${tab}!A2:${end}${rows.length + 1}`, rows);
    console.log(`  ✓ Seed ${rows.length} dòng vào tab "${tab}"`);
  } else {
    console.log(`  • Tab "${tab}" đã có dữ liệu (${data.length} dòng), không seed`);
  }
}

async function main(): Promise<void> {
  console.log("⚙️  Content Radar — setup Google Sheet\n");

  const existing = await listTabTitles();
  const required = Object.keys(HEADERS);
  const missing = required.filter((t) => !existing.includes(t));

  if (missing.length > 0) {
    console.log(`Tạo tab còn thiếu: ${missing.join(", ")}`);
    await createTabs(missing);
  } else {
    console.log("Tất cả tab đã tồn tại.");
  }

  console.log("\nGhi header:");
  for (const tab of required) {
    await ensureHeader(tab);
  }

  console.log("\nSeed dữ liệu mặc định:");
  await seedIfEmpty("Topics", SEED_TOPICS);
  await seedIfEmpty("Settings", SEED_SETTINGS);

  console.log(
    "\n✅ Xong. Mở Sheet và điền `line_target_id` (User ID LINE của bạn) ở tab Settings.",
  );
}

main().catch((err) => {
  console.error("\n❌ Setup lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
