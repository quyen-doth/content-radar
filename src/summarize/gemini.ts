// Tóm tắt bài sang tiếng Việt bằng Gemini Flash. Batch nhiều bài/1 request, trả JSON.
// Có fallback per-bài khi batch lỗi. Xem plan.md §4.3.

import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
} from "@google/generative-ai";
import type { Article } from "../types.ts";
import { requireEnv } from "../config.ts";
import { logger } from "../lib/logger.ts";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const BODY_LIMIT = 2000; // cắt body để khỏi tốn token
const PLACEHOLDER = "(không tóm tắt được — xem link gốc)";

let cachedModel: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (cachedModel) return cachedModel;
  const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
  cachedModel = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            summary_vi: { type: SchemaType.STRING },
          },
          required: ["id", "summary_vi"],
        },
      },
    },
  });
  return cachedModel;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildPrompt(articles: Article[]): string {
  const items = articles.map((a) => ({
    id: a.id,
    title: a.titleJp,
    body: truncate(a.body, BODY_LIMIT),
  }));
  return [
    "Tóm tắt từng bài viết kỹ thuật tiếng Nhật dưới đây sang TIẾNG VIỆT.",
    "Mỗi bài 2-3 câu, tập trung: bài nói về gì, dùng/đề xuất gì, ai nên đọc.",
    "Không thêm lời mở đầu, không dịch tiêu đề.",
    'Trả về JSON: mảng các object { "id", "summary_vi" } đúng theo id đầu vào.',
    "",
    "Dữ liệu bài viết (JSON):",
    JSON.stringify(items),
  ].join("\n");
}

/** Gọi model 1 lần cho 1 nhóm bài; trả Map id → summary_vi. Ném lỗi nếu request thất bại. */
async function summarizeChunk(
  model: GenerativeModel,
  articles: Article[],
): Promise<Map<string, string>> {
  const result = await model.generateContent(buildPrompt(articles));
  const text = result.response.text();
  const parsed = JSON.parse(text) as { id: string; summary_vi: string }[];
  const map = new Map<string, string>();
  for (const row of parsed) {
    if (row?.id && row?.summary_vi) map.set(String(row.id), row.summary_vi.trim());
  }
  return map;
}

/**
 * Tóm tắt tất cả bài (mutate `summaryVi` tại chỗ).
 * Chiến lược: batch 1 request → bài nào thiếu thì retry lẻ → vẫn thiếu thì dùng placeholder.
 */
export async function summarizeBatch(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;
  const model = getModel();

  let batchMap = new Map<string, string>();
  try {
    batchMap = await summarizeChunk(model, articles);
    logger.info(`Gemini batch: tóm tắt ${batchMap.size}/${articles.length} bài`);
  } catch (err) {
    logger.error("Gemini batch lỗi, chuyển fallback per-bài", err);
  }

  for (const a of articles) {
    const s = batchMap.get(a.id);
    if (s) a.summaryVi = s;
  }

  // Fallback per-bài cho bài còn thiếu.
  for (const a of articles.filter((x) => !x.summaryVi)) {
    try {
      const m = await summarizeChunk(model, [a]);
      a.summaryVi = m.get(a.id) || PLACEHOLDER;
      if (a.summaryVi === PLACEHOLDER) logger.warn(`Bài ${a.id}: model không trả tóm tắt`);
    } catch (err) {
      logger.error(`Tóm tắt lẻ bài ${a.id} lỗi`, err);
      a.summaryVi = PLACEHOLDER;
    }
  }

  return articles;
}
