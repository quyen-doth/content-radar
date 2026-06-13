# PRD — Hệ thống Theo dõi & Tóm tắt Nội dung (Phase 1: Qiita)

**Tên dự án (tạm):** Content Radar
**Phiên bản:** 1.0 — Phase 1
**Ngày:** 2026-06-13
**Trạng thái:** Draft để triển khai

---

## 1. Bối cảnh & Mục tiêu

### 1.1. Painpoint

Người dùng muốn theo dõi bài viết mới về các chủ đề quan tâm (ứng dụng AI, tiến bộ công nghệ AI) nhưng không muốn mất thời gian tự tìm kiếm.

### 1.2. Mục tiêu Phase 1

Tự động, mỗi ngày 1 lần:

1. Thu thập bài viết mới từ **Qiita** theo tag/chủ đề đã cấu hình.
2. Lọc trùng (không gửi lại bài đã gửi).
3. **Tóm tắt nội dung chính sang tiếng Việt** (tiêu đề + link giữ nguyên tiếng Nhật).
4. Gom thành 1 thông báo, đẩy qua **LINE Messaging API**.

### 1.3. Ngoài phạm vi Phase 1 (Roadmap)

- **GitHub** — top repo tăng sao nhiều nhất/tuần (cần GH Archive + BigQuery) → Phase 2.
- **note.com** — không có public API, cần scraping → Phase 3.
- Multi-user, dashboard web tự build → chưa cần.

---

## 2. User Story

> Là một engineer bận rộn, mỗi sáng tôi nhận 1 tin LINE gồm các bài Qiita mới đúng chủ đề tôi quan tâm, mỗi bài có tóm tắt tiếng Việt ngắn gọn, để tôi quyết định bài nào đáng đọc mà không phải tự search.

> Là người dùng, tôi muốn tự sửa danh sách tag/chủ đề và các cài đặt **trực tiếp trên Google Sheets** mà không cần đụng code.

---

## 3. Yêu cầu chức năng (Functional Requirements)

| ID    | Yêu cầu                                                      | Ưu tiên |
| ----- | ------------------------------------------------------------ | ------- |
| FR-1  | Đọc config (tag, settings) từ Google Sheets mỗi lần chạy     | Must    |
| FR-2  | Gọi Qiita API lấy bài mới theo từng tag đang `enabled`       | Must    |
| FR-3  | Lọc bài đã gửi (dedup theo `article_id` trong sheet History) | Must    |
| FR-4  | Tóm tắt mỗi bài mới sang tiếng Việt (≤ 2-3 câu) bằng Gemini  | Must    |
| FR-5  | Gom các bài mới thành 1 message, push qua LINE Messaging API | Must    |
| FR-6  | Ghi bài đã gửi vào sheet History (lịch sử + chống trùng)     | Must    |
| FR-7  | Chạy tự động theo lịch (cron, 1 lần/ngày)                    | Must    |
| FR-8  | Giới hạn số bài tối đa mỗi push (cấu hình được)              | Should  |
| FR-9  | Ghi log lỗi (API fail, quota) để debug                       | Should  |
| FR-10 | Thêm nguồn/chủ đề mới chỉ bằng cách thêm dòng trong Sheets   | Should  |

---

## 4. Kiến trúc & Luồng dữ liệu

```
                 ┌──────────────────────────────────────────────┐
                 │        GitHub Actions (cron: hằng ngày)        │
                 │                                                │
  Google Sheets  │   ┌──────────┐   ┌──────────┐   ┌──────────┐  │   LINE
  (Config) ──────┼──▶│ Read     │──▶│ Collect  │──▶│ Dedup    │  │
                 │   │ Config   │   │ (Qiita)  │   │ (vs Hist)│  │
                 │   └──────────┘   └──────────┘   └────┬─────┘  │
                 │                                       │        │
                 │   ┌──────────┐   ┌──────────┐   ┌────▼─────┐  │
  Google Sheets  │   │ Write    │◀──│ Notify   │◀──│ Summarize│  │
  (History) ◀────┼───│ History  │   │ (LINE)   │───┼─▶ (Gemini)│  │──▶ 📱
                 │   └──────────┘   └──────────┘   └──────────┘  │
                 └──────────────────────────────────────────────┘
```

Luồng tuần tự mỗi lần chạy:

1. **Read Config** — đọc tab `Topics` + `Settings` từ Sheets.
2. **Collect** — với mỗi tag `enabled`, gọi Qiita API lấy bài mới (lọc theo `created` gần đây).
3. **Dedup** — bỏ bài có `article_id` đã tồn tại trong tab `History`.
4. **Summarize** — gửi nội dung bài mới (đã lọc) qua Gemini → tóm tắt tiếng Việt.
5. **Notify** — gom tối đa N bài thành 1 message, push LINE.
6. **Write History** — append bài đã gửi vào tab `History`.

---

## 5. Tech Stack

| Lớp                | Lựa chọn                      | Ghi chú                    |
| ------------------ | ----------------------------- | -------------------------- |
| Ngôn ngữ / Runtime | **TypeScript + Bun**          | Khớp stack hiện có         |
| Scheduler          | **GitHub Actions cron**       | Miễn phí                   |
| Nguồn dữ liệu      | **Qiita REST API v2**         | Token cá nhân, ~1000 req/h |
| Config + History   | **Google Sheets API**         | Service Account auth       |
| Tóm tắt            | **Gemini API (Flash)**        | Free tier rộng             |
| Thông báo          | **LINE Messaging API** (push) | Tài khoản đã có            |

**Thư viện gợi ý:** `googleapis` (Sheets), `@google/generative-ai` (Gemini), `axios`/`fetch` (Qiita & LINE).

---

## 6. Data Model — Google Sheets

Một spreadsheet, nhiều tab. Đây vừa là **dashboard admin** vừa là **storage**.

### Tab `Topics` (config — bạn sửa ở đây)

| topic_id | tag_jp     | enabled | note             |
| -------- | ---------- | ------- | ---------------- |
| t1       | 生成AI     | TRUE    | AI tạo sinh      |
| t2       | AI活用     | TRUE    | Ứng dụng AI      |
| t3       | 業務効率化 | TRUE    | Tối ưu công việc |
| t4       | LLM        | TRUE    |                  |
| t5       | RAG        | TRUE    |                  |
| t6       | 機械学習   | FALSE   | tắt tạm          |

> Thêm/bớt chủ đề = thêm/sửa dòng + bật/tắt cột `enabled`. Không đụng code.

### Tab `Settings` (key-value)

| key                | value               |
| ------------------ | ------------------- |
| max_items_per_push | 5                   |
| summary_lang       | vi                  |
| lookback_hours     | 24                  |
| min_stocks         | 3                   |
| line_target_id     | (User ID nhận push) |

> `min_stocks`: chỉ lấy bài có ≥ N lượt "stock" (lọc nhiễu, lấy bài chất lượng).

### Tab `History` (storage + dedup — script tự ghi)

| article_id      | tag    | title_jp | url                   | published_at | stocks | summary_vi | sent_at          | status |
| --------------- | ------ | -------- | --------------------- | ------------ | ------ | ---------- | ---------------- | ------ |
| (Qiita item id) | 生成AI | ...      | https://qiita.com/... | 2026-06-13   | 12     | (tóm tắt)  | 2026-06-13T08:00 | sent   |

> `article_id` là khoá chống trùng. Trước khi gửi, script load toàn bộ cột `article_id` để so sánh.

### Tab `Logs` (tuỳ chọn, FR-9)

| timestamp | level | message |
| --------- | ----- | ------- |

---

## 7. Chi tiết logic từng bước

### 7.1. Collect (Qiita)

- Endpoint: `GET https://qiita.com/api/v2/items?query=tag:{tag}&page=1&per_page=20`
  hoặc dùng param `query=tag:生成AI created:>=YYYY-MM-DD`.
- Lọc client-side: `created_at` trong `lookback_hours` giờ gần nhất; `stocks_count >= min_stocks`.
- Gộp kết quả tất cả tag, **khử trùng theo `id`** (1 bài có thể trúng nhiều tag).

### 7.2. Dedup

- Load tập `article_id` từ tab `History`.
- Giữ lại bài chưa từng có trong tập đó.

### 7.3. Summarize (Gemini)

- Prompt mẫu (mỗi bài 1 lần gọi, hoặc batch nhiều bài 1 lần để tiết kiệm):
    ```
    Tóm tắt bài viết kỹ thuật tiếng Nhật sau sang TIẾNG VIỆT,
    2-3 câu, tập trung vào: bài này nói về gì, dùng/đề xuất gì,
    ai nên đọc. Không thêm lời mở đầu.
    ---
    Tiêu đề: {title}
    Nội dung: {body (rút gọn nếu quá dài)}
    ```
- Lưu ý quota: chỉ tóm tắt **bài đã lọt qua dedup** → volume rất nhỏ.

### 7.4. Notify (LINE)

- Gom tối đa `max_items_per_push` bài thành **1 push message** (tiết kiệm quota LINE).
- Định dạng mỗi bài:
    ```
    📌 {title_jp}
    📝 {summary_vi}
    🔗 {url}
    ⭐ {stocks} stocks
    ```
- API: `POST https://api.line.me/v2/bot/message/push` với `to = line_target_id`.

### 7.5. Write History

- Append từng bài đã gửi vào tab `History` với `status = sent`.

---

## 8. Scheduler (GitHub Actions)

`.github/workflows/daily-digest.yml` (phác thảo):

```yaml
name: Qiita Daily Digest
on:
    schedule:
        - cron: '0 23 * * *' # 08:00 JST (UTC+9)
    workflow_dispatch: # cho phép chạy tay để test
jobs:
    run:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: oven-sh/setup-bun@v2
            - run: bun install
            - run: bun run src/index.ts
              env:
                  QIITA_TOKEN: ${{ secrets.QIITA_TOKEN }}
                  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
                  LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
                  GOOGLE_SA_JSON: ${{ secrets.GOOGLE_SA_JSON }}
                  SHEET_ID: ${{ secrets.SHEET_ID }}
```

> `workflow_dispatch` quan trọng: cho phép chạy thử bất cứ lúc nào mà không chờ cron.

---

## 9. Cấu hình & Secrets cần chuẩn bị

| Secret                      | Cách lấy                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `QIITA_TOKEN`               | Qiita → Settings → Applications → Personal Access Token                                              |
| `GEMINI_API_KEY`            | Google AI Studio                                                                                     |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console (Messaging API channel)                                                      |
| `GOOGLE_SA_JSON`            | Google Cloud → tạo Service Account → key JSON. **Share spreadsheet với email của SA** (quyền Editor) |
| `SHEET_ID`                  | ID trong URL Google Sheets                                                                           |

---

## 10. Chi phí vận hành

| Dịch vụ            | Quy mô Phase 1     | Chi phí             |
| ------------------ | ------------------ | ------------------- |
| GitHub Actions     | ~1 phút/ngày       | 0đ (free tier dư)   |
| Qiita API          | vài chục req/ngày  | 0đ                  |
| Gemini Flash       | vài bài/ngày       | 0đ (free tier)      |
| Google Sheets API  | vài trăm cell/ngày | 0đ                  |
| LINE Messaging API | ~1 push/ngày       | 0đ (trong gói free) |

**Tổng: 0đ.**

---

## 11. Yêu cầu phi chức năng (Non-functional)

- **Khả năng mở rộng (scale theo nguồn/chủ đề):**
    - Collector thiết kế theo interface chung `Collector { fetch(): Promise<Article[]> }`.
      Thêm GitHub/note ở Phase sau = viết 1 class mới, không sửa pipeline.
    - Thêm chủ đề = thêm dòng trong tab `Topics`.
- **Idempotent:** chạy lại nhiều lần trong ngày không gửi trùng (nhờ dedup theo `article_id`).
- **Fault tolerance:** lỗi 1 tag/1 bài không làm hỏng cả run; ghi `Logs` và tiếp tục.
- **Quan sát được:** tab `Logs` + log stdout của Actions.

---

## 12. Bộ tag Qiita khởi tạo (gợi ý map từ chủ đề tiếng Việt)

| Chủ đề                             | Tag Qiita                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Ứng dụng AI vào công việc/đời sống | `生成AI`, `ChatGPT`, `AI活用`, `業務効率化`, `AIエージェント`, `RAG`, `プロンプトエンジニアリング` |
| Tiến bộ công nghệ phát triển AI    | `機械学習`, `LLM`, `DeepLearning`, `自然言語処理`, `大規模言語モデル`, `MLOps`                     |

> Đề xuất bật ~5-6 tag lúc đầu để tránh quá nhiều bài; tinh chỉnh dần qua cột `enabled` và `min_stocks`.

---

## 13. Roadmap

| Phase | Nội dung                                                  | Phụ thuộc          |
| ----- | --------------------------------------------------------- | ------------------ |
| **1** | Qiita → tóm tắt VI → LINE (tài liệu này)                  | —                  |
| **2** | GitHub: top repo tăng sao/tuần (GH Archive + BigQuery)    | BigQuery free tier |
| **3** | note.com (scraping) + tách History sang DB nếu volume lớn | Đánh giá ToS       |
| 4     | Tinh chỉnh lọc (semantic filter), nhiều kênh notify       | —                  |

---

## 14. Rủi ro & Câu hỏi mở

| Rủi ro                             | Giảm thiểu                                           |
| ---------------------------------- | ---------------------------------------------------- |
| Quota LINE free thấp hơn dự kiến   | Gom 1 push/ngày; xác nhận quota gói hiện tại         |
| Tóm tắt Gemini sai/ảo              | Giữ link gốc để người dùng tự kiểm chứng             |
| Tag Qiita ra quá nhiều/ít bài      | Điều chỉnh `min_stocks`, `lookback_hours`, `enabled` |
| Google Sheets chậm khi History lớn | Phase 3: tách History sang DB, giữ config ở Sheets   |

**Câu hỏi cần xác nhận trước khi code:**

1. Quota gói LINE Messaging API hiện tại của bạn là bao nhiêu message/tháng?
2. Giờ nhận thông báo mong muốn (PRD đang để 08:00 JST)?
3. Số bài tối đa mỗi lần gửi (PRD để mặc định 5)?
