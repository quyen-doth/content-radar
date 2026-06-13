// Ghi log buffer vào tab Logs. Tách khỏi lib/logger.ts để logger không phụ thuộc Sheets.
// Xem plan.md §4.5.

import { clearLogEntries, getLogEntries } from "../lib/logger.ts";
import { appendValues } from "./client.ts";

/** Flush toàn bộ log đã buffer vào tab Logs rồi xoá buffer. Nuốt lỗi để không làm hỏng run. */
export async function flushLogs(): Promise<void> {
  const entries = getLogEntries();
  if (entries.length === 0) return;
  const rows = entries.map((e) => [e.timestamp, e.level, e.message]);
  try {
    await appendValues("Logs!A:C", rows);
    clearLogEntries();
  } catch (err) {
    // Không dùng logger ở đây để tránh đệ quy; chỉ in stderr.
    console.error(
      "Không ghi được tab Logs:",
      err instanceof Error ? err.message : err,
    );
  }
}
