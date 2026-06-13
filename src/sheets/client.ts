// Auth Service Account (JWT) + Google Sheets client + helper đọc/ghi. Xem plan.md §4.1.

import { google, type sheets_v4 } from "googleapis";
import { getServiceAccount, requireEnv } from "../config.ts";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

let cachedClient: sheets_v4.Sheets | null = null;

/** Trả Sheets client đã xác thực (cache lại trong 1 run). */
export function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  const sa = getServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

export function getSheetId(): string {
  return requireEnv("SHEET_ID");
}

/** Đọc 1 range, trả mảng 2 chiều (rỗng nếu không có dữ liệu). */
export async function getValues(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range,
  });
  return (res.data.values as string[][]) ?? [];
}

/** Append các dòng vào cuối range (RAW, theo hàng). */
export async function appendValues(
  range: string,
  rows: (string | number)[][],
): Promise<void> {
  if (rows.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

/** Ghi đè giá trị vào range (RAW). */
export async function updateValues(
  range: string,
  rows: (string | number)[][],
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

/** Tên các tab hiện có trong spreadsheet. */
export async function listTabTitles(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
}

/** Tạo các tab còn thiếu (1 batchUpdate). */
export async function createTabs(titles: string[]): Promise<void> {
  if (titles.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });
}
