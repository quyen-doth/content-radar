// Logger: ghi ra stdout NGAY và buffer lại để flush 1 lần vào tab Logs cuối run.
// Không phụ thuộc Sheets (tránh coupling); việc append do sheets/logs.ts đảm nhiệm.
// Xem plan.md §4.5.

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string; // ISO
  level: LogLevel;
  message: string;
}

const buffer: LogEntry[] = [];

function record(level: LogLevel, message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  buffer.push(entry);
  const line = `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string) => record("info", message),
  warn: (message: string) => record("warn", message),
  /** Ghi lỗi; nếu truyền Error sẽ kèm message của nó. */
  error: (message: string, err?: unknown) => {
    const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
    record("error", message + detail);
  },
};

/** Lấy toàn bộ entry đã buffer (để ghi vào tab Logs). */
export function getLogEntries(): readonly LogEntry[] {
  return buffer;
}

/** Xoá buffer (sau khi đã flush). */
export function clearLogEntries(): void {
  buffer.length = 0;
}
