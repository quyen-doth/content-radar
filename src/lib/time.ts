// Tiện ích thời gian: lọc theo lịch NGÀY tính theo múi giờ JST (UTC+9). Xem plan.md §4.2.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant ứng với 00:00 JST của ngày (theo lịch JST) chứa `now`. */
export function startOfTodayJST(now: Date = new Date()): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS); // dịch sang JST để lấy đúng ngày
  const midnightUtcOfJstDate = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
  );
  return new Date(midnightUtcOfJstDate - JST_OFFSET_MS); // 00:00 JST = 00:00 UTC ngày đó − 9h
}

/** Mốc cắt = 00:00 JST của (hôm nay − `days` ngày). */
export function cutoffFromDays(days: number, now: Date = new Date()): Date {
  return new Date(startOfTodayJST(now).getTime() - days * DAY_MS);
}

/** YYYY-MM-DD theo lịch JST của một instant. */
export function toJstDateString(instant: Date): string {
  return new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Ngày dùng cho query Qiita `created:>=`: JST date của (cutoff − 1 ngày) để chừa biên
 * (query chỉ lọc theo NGÀY); client-side vẫn lọc chính xác theo instant cutoff.
 */
export function queryDateForCutoff(cutoff: Date): string {
  return toJstDateString(new Date(cutoff.getTime() - DAY_MS));
}
