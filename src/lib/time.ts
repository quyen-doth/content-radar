// Tiện ích thời gian cho lọc lookback. Xem plan.md §4.2.

/** Mốc cắt = bây giờ trừ đi `hours` giờ. */
export function cutoffFromHours(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Định dạng YYYY-MM-DD (UTC) để đưa vào query Qiita `created:>=`. */
export function toQiitaDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ngày dùng cho query Qiita: lùi thêm 1 ngày so với mốc cắt để không sót bài
 * ở ranh giới (query chỉ lọc theo NGÀY); sau đó lọc lại chính xác theo giờ ở client.
 */
export function queryDateForCutoff(cutoff: Date): string {
  return toQiitaDate(new Date(cutoff.getTime() - 24 * 60 * 60 * 1000));
}
