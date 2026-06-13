# Kế hoạch triển khai — Content Radar (Phase 1: Qiita → tóm tắt VI → LINE)

**Nguồn:** [`prd.md`](./prd.md) · **Ngày lập:** 2026-06-13 · **Trạng thái:** Sẵn sàng code

> Tài liệu này biến PRD thành kế hoạch thi công cụ thể: cấu trúc code, quyết định kỹ thuật,
> các phase, và checklist. Đọc kèm `CLAUDE.md` cho quy ước chung.

---

## 0. Các quyết định đã chốt (khác/bổ sung so với PRD)

| Điểm | PRD nói | Quyết định triển khai | Lý do |
| ---- | ------- | --------------------- | ----- |
| Lọc chất lượng | `min_stocks` (≥ N stock) | **Đổi sang `min_likes`** (≥ N LGTM) | Qiita API v2 **không trả `stocks_count` công khai** (chỉ tác giả xem được). Trường `likes_count` luôn có sẵn, không tốn thêm request. |
| Khởi tạo Sheet | Không nói rõ | **Có hướng dẫn tạo thủ công + script `setup` tự bootstrap** tab/header + seed Topics/Settings | Người dùng chưa có sheet. |
| Gọi Gemini | Mỗi bài 1 lần hoặc batch | **Batch**: gộp nhiều bài → 1 request, trả JSON `[{id, summary_vi}]` | Tiết kiệm quota, ít request. Có fallback per-bài khi parse lỗi. |
| Test LINE | — | Có sẵn token + User ID → **kèm bước test push thật** + cờ `DRY_RUN` để test cục bộ không gửi | |
| Runtime | TypeScript + **Bun** | **Đổi sang Node + npm + `tsx`** | Máy đã có Node v24, chưa có Bun → bỏ bước cài Bun. Workload nhẹ (cron 1 lần/ngày, I/O) nên runtime không tạo khác biệt. CI dùng `actions/setup-node` + `npm ci`. |

**Config mặc định (ghi vào tab `Settings` lúc seed):**
`max_items_per_push=5`, `summary_lang=vi`, `lookback_hours=24`, `min_likes=3`, `line_target_id=<User ID của bạn>`.
Lịch chạy: `cron: 0 23 * * *` (08:00 JST).

---

## 1. Cấu trúc thư mục dự kiến

```
content-radar/
├── prd.md
├── CLAUDE.md
├── plan.md
├── package.json
├── tsconfig.json
├── .env.example              # mẫu biến môi trường (không commit .env thật)
├── .gitignore
├── .github/workflows/
│   └── daily-digest.yml      # cron + workflow_dispatch
└── src/
    ├── index.ts              # entrypoint: gọi runPipeline()
    ├── pipeline.ts           # orchestrate 6 bước, fault-tolerant
    ├── config.ts             # đọc & validate env (fail-fast nếu thiếu secret)
    ├── types.ts              # Article, Topic, Settings, Collector...
    ├── setup.ts              # `npm run setup` — bootstrap tab/header + seed
    ├── sheets/
    │   ├── client.ts         # auth Service Account (JWT) + Sheets client
    │   ├── config.ts         # đọc tab Topics + Settings
    │   ├── history.ts        # đọc set article_id; append bài đã gửi
    │   └── logs.ts           # append dòng log (tuỳ chọn)
    ├── collectors/
    │   ├── collector.ts      # interface Collector { fetch(): Promise<Article[]> }
    │   └── qiita.ts          # QiitaCollector
    ├── summarize/
    │   └── gemini.ts         # summarizeBatch(articles) → Map<id, summary_vi>
    ├── notify/
    │   └── line.ts           # pushDigest(articles)
    └── lib/
        ├── logger.ts         # log stdout + buffer cho tab Logs
        └── time.ts           # tiện ích timezone/lookback
```

---

## 2. Data model — kiểu dữ liệu nội bộ (`src/types.ts`)

```ts
interface Topic { topicId: string; tagJp: string; enabled: boolean; note?: string; }

interface Settings {
  maxItemsPerPush: number;
  summaryLang: string;     // 'vi'
  lookbackHours: number;
  minLikes: number;        // thay cho min_stocks
  lineTargetId: string;
}

interface Article {
  id: string;              // Qiita item id — KHOÁ chống trùng
  tag: string;             // tag đã match (bài có thể match nhiều tag → giữ tag đầu)
  titleJp: string;
  url: string;
  publishedAt: string;     // created_at (ISO)
  likes: number;           // likes_count
  body: string;            // markdown, để đưa vào tóm tắt (sẽ cắt ngắn)
  summaryVi?: string;      // điền sau bước Summarize
}

interface Collector { fetch(): Promise<Article[]>; }  // mở rộng Phase 2/3 = class mới
```

Tab `History` (cột giữ nguyên PRD §6, chỉ đổi `stocks` → `likes`):
`article_id | tag | title_jp | url | published_at | likes | summary_vi | sent_at | status`

---

## 3. Pipeline — 6 bước (`src/pipeline.ts`)

Chạy tuần tự, **fault-tolerant**: lỗi 1 tag/1 bài → log & bỏ qua, không sập cả run.

1. **Read Config** — `sheets/config.ts` đọc `Topics` (lọc `enabled=TRUE`) + `Settings`.
2. **Collect** — với mỗi tag, `QiitaCollector.fetch()`; lọc `created_at` trong `lookback_hours`
   và `likes >= min_likes`; gộp tất cả tag rồi **khử trùng theo `id`**.
3. **Dedup vs History** — `history.ts` load set `article_id` đã gửi; bỏ bài đã có.
4. **Summarize** — `gemini.ts` batch các bài còn lại → tiếng Việt 2–3 câu.
5. **Notify** — `line.ts` gom tối đa `maxItemsPerPush` bài → 1 push.
6. **Write History** — append từng bài đã gửi (`status=sent`, `sent_at=now`).

> Nếu sau Dedup không còn bài nào → log "no new items" và kết thúc sớm (không gọi Gemini/LINE).
> Cờ `DRY_RUN=true`: chạy hết bước 1–4, in digest ra stdout, **bỏ qua** push LINE & ghi History.

---

## 4. Chi tiết kỹ thuật từng module

### 4.1 `sheets/client.ts` — Auth
- Parse `GOOGLE_SA_JSON` (chuỗi JSON từ env) → `google.auth.JWT` với scope
  `https://www.googleapis.com/auth/spreadsheets`.
- Export `sheets` client + helper `getValues(range)` / `appendValues(range, rows)`.

### 4.2 `collectors/qiita.ts`
- `GET https://qiita.com/api/v2/items?query=tag:{tag}+created:>={YYYY-MM-DD}&per_page=20&page=1`
  - `{date}` = (now − lookback_hours), lấy granularity ngày cho query, rồi **lọc lại theo giờ** ở client.
  - Header `Authorization: Bearer ${QIITA_TOKEN}` (nâng rate limit lên ~1000 req/h).
- Map response → `Article` (`id, title, url, created_at, likes_count, body, tags`).
- Lọc client-side: trong `lookback_hours` **và** `likes >= min_likes`.
- Rate limit: đọc header `Rate-Remaining`; tag lỗi → log & tiếp tục tag khác.

### 4.3 `summarize/gemini.ts`
- SDK `@google/generative-ai`, model **`gemini-2.0-flash`** (Flash, free tier).
- **Batch**: 1 prompt chứa danh sách `[{id, title, body(cắt ~2000 ký tự)}]`, yêu cầu trả
  **JSON** `[{ "id": "...", "summary_vi": "..." }]` (đặt `responseMimeType: "application/json"`).
- Prompt theo PRD §7.3: tóm tắt sang tiếng Việt 2–3 câu (nói về gì / dùng-đề xuất gì / ai nên đọc),
  không lời mở đầu.
- **Fallback**: nếu parse JSON lỗi hoặc thiếu id → tóm tắt lại từng bài đó riêng lẻ; nếu vẫn lỗi
  → `summary_vi = "(không tóm tắt được — xem link gốc)"`, log lỗi, vẫn gửi bài.

### 4.4 `notify/line.ts`
- `POST https://api.line.me/v2/bot/message/push`, header `Authorization: Bearer ${LINE_TOKEN}`.
- Body: `{ to: lineTargetId, messages: [{ type: "text", text }] }`.
- Format mỗi bài (PRD §7.4), đổi nhãn ⭐ stocks → 👍 likes:
  ```
  📌 {title_jp}
  📝 {summary_vi}
  🔗 {url}
  👍 {likes} likes
  ```
- **Giới hạn LINE**: 1 text ≤ 5000 ký tự, 1 push ≤ 5 message object. Gom các bài thành 1 text;
  nếu vượt 5000 ký tự thì tách thành nhiều text (vẫn trong 1 request push).

### 4.5 `sheets/history.ts` & `logs.ts`
- `loadSentIds()` → đọc `History!A2:A`, trả `Set<string>`.
- `appendSent(articles)` → `spreadsheets.values.append` vào `History`.
- `logs.ts.append(level, message)` → buffer trong run, flush 1 lần vào tab `Logs` cuối run.

### 4.6 `config.ts`
- Đọc & validate env: `QIITA_TOKEN`, `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`,
  `GOOGLE_SA_JSON`, `SHEET_ID`. Thiếu bất kỳ cái nào → **fail-fast** với thông báo rõ.
- `DRY_RUN` (mặc định false).

---

## 5. Các Phase thực hiện (theo thứ tự, mỗi phase test được độc lập)

- [ ] **Phase 0 — Scaffold & Setup**
  - `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, cài deps:
    `googleapis`, `@google/generative-ai`.
  - **Hướng dẫn tạo Google Sheet** (mục 6 bên dưới) → có `SHEET_ID`.
  - `src/setup.ts`: tạo tab `Topics/Settings/History/Logs` nếu thiếu, ghi header, seed
    Topics (bộ tag PRD §12) + Settings mặc định. Chạy `npm run setup`.
- [ ] **Phase 1 — Sheets layer** (`client/config/history/logs`). Test: in ra Topics+Settings đọc được.
- [ ] **Phase 2 — Qiita collector**. Test: fetch 1 tag, in số bài sau lọc.
- [ ] **Phase 3 — Dedup**. Test: chạy 2 lần, lần 2 ra 0 bài mới.
- [ ] **Phase 4 — Gemini summarize (batch)**. Test với 2–3 bài mẫu.
- [ ] **Phase 5 — LINE notify**. Test với `DRY_RUN` rồi push thật 1 bài.
- [ ] **Phase 6 — Orchestration** (`pipeline.ts` + `index.ts`), wiring fault-tolerant + Logs.
- [ ] **Phase 7 — GitHub Actions** `daily-digest.yml` (cron + `workflow_dispatch`) + nạp 5 secrets.
- [ ] **Phase 8 — Test end-to-end**: `workflow_dispatch` chạy tay → nhận LINE thật → kiểm History.

---

## 6. Hướng dẫn tạo Google Sheet (Phase 0)

1. Tạo 1 Google Spreadsheet trống. Lấy `SHEET_ID` từ URL
   (`docs.google.com/spreadsheets/d/<SHEET_ID>/edit`).
2. Google Cloud Console → tạo **Service Account** → tạo **key JSON** → nội dung JSON này là `GOOGLE_SA_JSON`.
   Bật **Google Sheets API** cho project.
3. **Share spreadsheet** với email service account (dạng `...@...iam.gserviceaccount.com`), quyền **Editor**.
4. Chạy `npm run setup` để tự tạo 4 tab + header + seed dữ liệu mặc định.
5. Mở Sheet, điền `line_target_id` (User ID của bạn) ở tab `Settings`, bật/tắt tag ở tab `Topics`.

---

## 7. Secrets / Env (GitHub Actions + `.env` cục bộ)

| Biến | Dùng cho |
| ---- | -------- |
| `QIITA_TOKEN` | Qiita API (Bearer) |
| `GEMINI_API_KEY` | Gemini Flash |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE push |
| `GOOGLE_SA_JSON` | Auth Sheets (chuỗi JSON service account) |
| `SHEET_ID` | ID spreadsheet |
| `DRY_RUN` *(tuỳ chọn)* | `true` để test cục bộ không gửi/không ghi |

`.env` cho chạy cục bộ; trên CI dùng GitHub Secrets (xem `daily-digest.yml` ở PRD §8).

---

## 8. Phi chức năng cần đảm bảo (PRD §11)

- **Idempotent**: chạy lại trong ngày không gửi trùng (dedup theo `article_id`).
- **Fault tolerance**: try/catch theo từng tag và từng bài; ghi `Logs` + stdout; run vẫn hoàn tất.
- **Mở rộng**: thêm nguồn = class implement `Collector`, không sửa `pipeline.ts`; thêm chủ đề = thêm dòng `Topics`.
- **Quan sát được**: tab `Logs` + log stdout của Actions.

---

## 9. Rủi ro & điểm cần để ý

| Rủi ro | Giảm thiểu |
| ------ | ---------- |
| Qiita không có `stocks_count` | Đã chuyển sang `likes_count` (đã chốt). |
| `query=tag:` chỉ lọc ngày, không lọc giờ | Lọc lại `lookback_hours` ở client. |
| Gemini trả JSON sai định dạng | `responseMimeType: application/json` + fallback per-bài + giữ link gốc. |
| Body bài quá dài → tốn token | Cắt body ~2000 ký tự trước khi gửi Gemini. |
| LINE vượt giới hạn ký tự/message | Tách thành ≤5 text trong 1 push. |
| History lớn dần làm chậm | Chấp nhận ở Phase 1; Phase 3 tách sang DB (roadmap). |

---

## 10. Định nghĩa "hoàn thành" Phase 1

- `npm start` (hoặc `workflow_dispatch`) lấy bài Qiita mới đúng tag enabled,
  không gửi trùng, tóm tắt tiếng Việt, **đẩy 1 push LINE** tới User ID, và **ghi History**.
- Cron 08:00 JST chạy tự động; chạy lại thủ công nhiều lần không sinh thông báo trùng.
