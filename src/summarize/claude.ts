import type { Article } from "../types.ts";
import { logger } from "../lib/logger.ts";
import { registerTool, clearRegistry } from "../ai/tools.ts";
import { runAgent } from "../ai/agent.ts";

const BODY_LIMIT = 2000;
const PLACEHOLDER = "(không tóm tắt được — xem link gốc)";

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface SummaryItem {
  id: string;
  summary_vi: string;
}

function setupSaveSummariesTool(): SummaryItem[] {
  const captured: SummaryItem[] = [];

  clearRegistry();
  registerTool(
    {
      name: "save_summaries",
      description:
        "Lưu kết quả tóm tắt các bài viết. Gọi tool này 1 lần duy nhất với toàn bộ tóm tắt.",
      input_schema: {
        type: "object" as const,
        properties: {
          summaries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "ID bài viết gốc" },
                summary_vi: {
                  type: "string",
                  description: "Tóm tắt tiếng Việt 2-3 câu",
                },
              },
              required: ["id", "summary_vi"],
            },
            description: "Mảng các tóm tắt, mỗi phần tử ứng với 1 bài viết đầu vào",
          },
        },
        required: ["summaries"],
      },
    },
    (input) => {
      const items = input.summaries as SummaryItem[];
      captured.push(...items);
      return { status: "ok", count: items.length };
    },
  );

  return captured;
}

function buildPrompt(articles: Article[]): string {
  const items = articles.map((a) => ({
    id: a.id,
    title: a.titleJp,
    body: truncate(a.body, BODY_LIMIT),
  }));
  return [
    "Tóm tắt từng bài viết kỹ thuật tiếng Nhật dưới đây sang TIẾNG VIỆT.",
    "Mỗi bài 2-3 câu: bài nói về gì, dùng/đề xuất gì, ai nên đọc.",
    "Không thêm lời mở đầu, không dịch tiêu đề.",
    "Dùng tool save_summaries để trả kết quả (1 lần duy nhất, gồm tất cả bài).",
    "",
    "Dữ liệu bài viết (JSON):",
    JSON.stringify(items),
  ].join("\n");
}

const SYSTEM_PROMPT =
  "Bạn là trợ lý tóm tắt bài viết kỹ thuật. Luôn dùng tool save_summaries để trả kết quả.";

async function summarizeChunk(articles: Article[]): Promise<Map<string, string>> {
  const captured = setupSaveSummariesTool();
  await runAgent(buildPrompt(articles), SYSTEM_PROMPT);

  const map = new Map<string, string>();
  for (const item of captured) {
    if (item?.id && item?.summary_vi) {
      map.set(String(item.id), item.summary_vi.trim());
    }
  }
  return map;
}

export async function summarizeBatch(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;

  let batchMap = new Map<string, string>();
  try {
    batchMap = await summarizeChunk(articles);
    logger.info(`Claude batch: tóm tắt ${batchMap.size}/${articles.length} bài`);
  } catch (err) {
    logger.error("Claude batch lỗi, chuyển fallback per-bài", err);
  }

  for (const a of articles) {
    const s = batchMap.get(a.id);
    if (s) a.summaryVi = s;
  }

  for (const a of articles.filter((x) => !x.summaryVi)) {
    try {
      const m = await summarizeChunk([a]);
      a.summaryVi = m.get(a.id) || PLACEHOLDER;
      if (a.summaryVi === PLACEHOLDER) logger.warn(`Bài ${a.id}: model không trả tóm tắt`);
    } catch (err) {
      logger.error(`Tóm tắt lẻ bài ${a.id} lỗi`, err);
      a.summaryVi = PLACEHOLDER;
    }
  }

  return articles;
}
