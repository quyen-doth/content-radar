// Đọc & validate biến môi trường. Fail-fast nếu thiếu secret. Xem plan.md §4.6.

/** Lấy 1 biến env bắt buộc; ném lỗi rõ ràng nếu thiếu. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${name}. ` +
        `Kiểm tra file .env (cục bộ) hoặc GitHub Secrets (CI).`,
    );
  }
  return value.trim();
}

/** Parse GOOGLE_SA_JSON (chuỗi JSON service account) → object. */
export function getServiceAccount(): {
  client_email: string;
  private_key: string;
} {
  const raw = requireEnv("GOOGLE_SA_JSON");
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SA_JSON không phải JSON hợp lệ. Dán nguyên nội dung file key JSON của service account.",
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GOOGLE_SA_JSON thiếu client_email hoặc private_key.",
    );
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export const isDryRun = (): boolean =>
  (process.env.DRY_RUN ?? "false").toLowerCase() === "true";
