// src/sheetsService.js - Google Sheets 予約データ管理
const { google } = require('googleapis');
const config = require('./config');
const { timeToMinutes, minutesToTime } = require('./utils');

let _sheets = null;

/** Google Sheets クライアントを返す (シングルトン) */
async function getSheets() {
  if (_sheets) return _sheets;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/**
 * シートにヘッダー行がなければ作成する
 * 列構成: 日付 | 開始時間 | 終了時間 | メニュー | 時間(分) | お名前 | LINE UserID | 予約日時 | ステータス
 */
async function ensureHeaders() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A1:I1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['日付', '開始時間', '終了時間', 'メニュー', '時間（分）', 'お名前', 'LINE UserID', '予約日時', 'ステータス']],
      },
    });
    console.log('✅ シートにヘッダー行を作成しました');
  }
}

/**
 * 指定日の「確定」済み予約をすべて取得
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {Array} rows
 */
async function getReservationsForDate(dateStr) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return []; // ヘッダーのみ or 空

  // row[0]=日付, row[1]=開始, row[2]=終了, row[8]=ステータス
  return rows.slice(1).filter(row => row[0] === dateStr && row[8] === '確定');
}

/**
 * 指定日・指定時間の空きスロット一覧を返す
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {number} duration 施術時間（分）
 * @returns {string[]} 空き時間の配列 ["10:00", "10:30", ...]
 */
async function getAvailableSlots(dateStr, duration) {
  const { BUSINESS_START, BUSINESS_END, SLOT_INTERVAL } = config;

  const reservations = await getReservationsForDate(dateStr);

  // 当日の場合は「現在時刻 + 1時間」以降のスロットのみ表示
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const nowMinutes = (dateStr === todayStr)
    ? now.getHours() * 60 + now.getMinutes() + 60  // 当日は1時間後以降
    : 0;

  const lastStart = BUSINESS_END - duration;
  const available = [];

  for (let t = BUSINESS_START; t <= lastStart; t += SLOT_INTERVAL) {
    // 当日の過去スロットはスキップ
    if (t < nowMinutes) continue;

    const slotEnd = t + duration;
    let isAvailable = true;

    // 既存予約との重複チェック
    for (const row of reservations) {
      const resStart = timeToMinutes(row[1]);
      const resEnd   = timeToMinutes(row[2]);
      // オーバーラップ判定: slotStart < resEnd && slotEnd > resStart
      if (t < resEnd && slotEnd > resStart) {
        isAvailable = false;
        break;
      }
    }

    if (isAvailable) available.push(minutesToTime(t));
  }

  return available;
}

/**
 * 予約をシートに保存する
 * @param {object} booking { date, time, menu, duration, name, userId }
 * @returns {string} 終了時刻 "HH:mm"
 */
async function saveBooking({ date, time, menu, duration, name, userId }) {
  await ensureHeaders();
  const sheets = await getSheets();

  const endMinutes = timeToMinutes(time) + parseInt(duration);
  const endTime    = minutesToTime(endMinutes);
  const menuName   = config.MENUS[menu] || menu;
  const now        = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        date,      // A: 日付
        time,      // B: 開始時間
        endTime,   // C: 終了時間
        menuName,  // D: メニュー
        duration,  // E: 時間（分）
        name,      // F: お名前
        userId,    // G: LINE UserID
        now,       // H: 予約日時
        '確定',    // I: ステータス
      ]],
    },
  });

  console.log(`📝 予約保存: ${date} ${time}〜${endTime} ${menuName} ${name}様`);
  return endTime;
}

module.exports = { getAvailableSlots, saveBooking, ensureHeaders };
