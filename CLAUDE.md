# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Trạng thái dự án

Code đã triển khai xong Phase 1–7 (Qiita → tóm tắt VI → LINE). Xem `docs/plan.md` cho chi tiết.

`docs/prd.md` viết bằng tiếng Việt. Quy ước ngôn ngữ: PRD, config trong Sheets và phần tóm tắt
gửi cho người dùng đều bằng **tiếng Việt**; còn tiêu đề và link bài viết giữ nguyên
**tiếng Nhật**.

## Sản phẩm cần xây

**Content Radar** — job chạy 1 lần/ngày: thu thập bài Qiita mới theo chủ đề, lọc trùng với
lịch sử, tóm tắt từng bài sang tiếng Việt bằng Claude Haiku, rồi đẩy 1 digest gộp qua LINE.
Phase 1 chỉ làm Qiita; GitHub (Phase 2) và note.com (Phase 3) thuộc roadmap.

## Tech stack (PRD §5)

- **TypeScript + Node (npm + `tsx`)** — chạy TS trực tiếp không cần build. Lệnh: `npm install`,
  `npm run setup` (bootstrap Sheet), `npm run check` (kiểm tra Sheets), `npm run dev` (DRY_RUN, không
  gửi LINE/ghi History), `npm start` (chạy thật). *(PRD §5 đề xuất Bun nhưng đã đổi sang Node/npm —
  máy đã có Node, bỏ được bước cài Bun; xem plan.md §0.)*
- **GitHub Actions cron** — scheduler tại `.github/workflows/daily-digest.yml`, lịch `0 23 * * *`
  (08:00 JST). Luôn kèm `workflow_dispatch` để chạy tay khi test, không phải chờ cron.
- Thư viện: `googleapis` (Sheets), `@anthropic-ai/sdk` (Claude Haiku — agent + tool registry), `fetch` cho Qiita & LINE.

## Kiến trúc — pipeline tuần tự 6 bước

Mỗi lần chạy là 1 lượt duy nhất, không có server thường trú. Thứ tự các bước:

1. **Read Config** — đọc tab `Topics` (tag đang bật) và `Settings` (key-value) từ Google Sheets.
2. **Collect** — với mỗi tag enabled, gọi Qiita `GET /api/v2/items?query=tag:{tag}`; lọc
   client-side theo `lookback_days` (cửa sổ theo lịch, mốc 00:00 JST) và `min_likes` (xem ghi
   chú bên dưới); **khử trùng giữa các tag theo `id`** (1 bài có thể trúng nhiều tag).
3. **Dedup vs History** — load toàn bộ `article_id` từ tab `History`; bỏ bài đã từng gửi.
4. **Summarize** — Claude Haiku (agent + tool `save_summaries`), tiếng Việt, 2–3 câu. Chỉ tóm tắt bài đã qua dedup để tiết kiệm quota.
5. **Notify** — gom tối đa `max_items_per_push` bài thành **1** push LINE (`POST /v2/bot/message/push`)
   để tiết kiệm quota LINE.
6. **Write History** — append từng bài đã gửi vào tab `History` với `status = sent`.

### Google Sheets vừa là dashboard admin vừa là datastore

Một spreadsheet, nhiều tab (`Topics`, `Settings`, `History`, và `Logs` tuỳ chọn). Người dùng
sửa chủ đề/cài đặt trực tiếp trên Sheets — **không hardcode tag hay tham số trong code**;
chúng được đọc từ `Topics`/`Settings` ở mỗi lần chạy. Script tự ghi `History` và `Logs`.
Cấu trúc cột xem PRD §6.

> **Lưu ý quan trọng:** PRD dùng `min_stocks` (số stock) để lọc chất lượng, nhưng Qiita API v2
> **không trả `stocks_count` công khai**. Dự án dùng `likes_count` (LGTM) thay thế — config là
> `min_likes`, cột History là `likes`. Xem `plan.md` §0.

### Ràng buộc thiết kế bắt buộc giữ

- **Collector dạng plugin** — mô hình hoá collector theo `interface Collector { fetch(): Promise<Article[]> }`
  để nguồn Phase 2/3 là class mới, không phải sửa pipeline.
- **Idempotent** — chạy lại nhiều lần trong cùng ngày không được gửi trùng; dedup theo
  `article_id` là cơ chế đảm bảo.
- **Fault tolerant** — lỗi 1 tag hoặc 1 bài không được làm hỏng cả run; ghi log
  (tab `Logs` + stdout) rồi tiếp tục.

## Secrets / biến môi trường

Cấp qua GitHub Actions secrets, đọc từ env lúc runtime:
`QIITA_TOKEN`, `ANTHROPIC_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `GOOGLE_SA_JSON`, `SHEET_ID`.
Email của Google service account phải được share quyền Editor trên spreadsheet.
