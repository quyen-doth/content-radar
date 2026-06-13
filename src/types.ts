// Kiểu dữ liệu dùng chung cho toàn pipeline. Xem plan.md §2.

export interface Topic {
  topicId: string;
  tagJp: string;
  enabled: boolean;
  note?: string;
}

export interface Settings {
  maxItemsPerPush: number;
  summaryLang: string; // 'vi'
  lookbackDays: number;
  minLikes: number; // thay cho min_stocks (Qiita không trả stocks_count công khai)
  lineTargetId: string;
}

export interface Article {
  id: string; // Qiita item id — KHOÁ chống trùng
  tag: string; // tag đã match (bài có thể match nhiều tag → giữ tag đầu)
  titleJp: string;
  url: string;
  publishedAt: string; // created_at (ISO)
  likes: number; // likes_count
  body: string; // markdown, đưa vào tóm tắt (sẽ cắt ngắn)
  summaryVi?: string; // điền sau bước Summarize
}

// Mở rộng nguồn Phase 2/3 = viết class implement interface này, không sửa pipeline.
export interface Collector {
  fetch(): Promise<Article[]>;
}
