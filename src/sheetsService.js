// src/sheetsService.js - Google Sheets & Calendar 予約データ管理
const { google } = require('googleapis');
const config = require('./config');
const { timeToMinutes, minutesToTime } = require('./utils');

let _auth = null;
let _sheets = null;
let _calendar = null;

/** Google Auth クライアントを返す */
async function getAuth() {
  if (_auth) return _auth;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  return _auth;
}

/** Google Sheets クライアント */
async function getSheets() {
  if (_sheets) return _sheets;
  const auth = await getAuth();
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

/** Google Calendar クライアント */
async function getCalendar() {
  if (_calendar) return _calendar;
  const auth = await getAuth();
  _calendar = google.calendar({ version: 'v3', auth });
  return _calendar;
}

/** Googleカレンダーから予定を取得 */
async function getCalendarEvents(dateStr) {
  if (!config.CALENDAR_ID) {
    console.log('⚠️ CALENDAR_ID が設定されていません。スキップします。');
    return [];
  }
  console.log(`🔍 カレンダー確認中: ${dateStr}`);
  try {
    const calendar = await getCalendar();
    const timeMin = `${dateStr}T00:00:00+09:00`;
    const timeMax = `${dateStr}T23:59:59+09:00`;

    const res = await calendar.events.list({
      calendarId: config.CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Tokyo',
    });

    const events = res.data.items || [];
    console.log(`✅ カレンダーから ${events.length} 件取得しました。`);

    return events.map(e => {
      let start, end;

      if (e.start.dateTime) {
        // 時刻指定の予定: サーバーのTZに依存しないようJST文字列からパース
        const startDate = new Date(e.start.dateTime);
        const endDate   = new Date(e.end.dateTime);
        
        // JST基準での時間を取得 (intl を使用して確実に時・分を取り出す)
        const getJSTTime = (date) => {
          const parts = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false
          }).formatToParts(date);
          let h = 0, m = 0;
          for (const part of parts) {
            if (part.type === 'hour') h = parseInt(part.value);
            if (part.type === 'minute') m = parseInt(part.value);
          }
          return h * 60 + m;
        };

        start = getJSTTime(startDate);
        end   = getJSTTime(endDate);
      } else {
        // 終日予定
        start = 0;
        end   = 1440;
      }
      
      console.log(`   - 予定: ${e.summary} (${start}分 〜 ${end}分)`);
      return { start, end };
    });
  } catch (err) {
    console.error('❌ カレンダー取得失敗:', err.message);
    return [];
  }
}

/** シートにヘッダー行作成 */
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
  }
}

/** 指定日の既存予約を取得 */
async function getReservationsForDate(dateStr) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
  });
  const rows = res.data.values || [];
  return rows.slice(1).filter(row => row[0] === dateStr && row[8] === '確定');
}

/** 空き時間を取得 */
async function getAvailableSlots(dateStr, duration) {
  const { BUSINESS_START, BUSINESS_END, SLOT_INTERVAL } = config;
  
  // 予約とカレンダーの両方を取得
  const reservations = await getReservationsForDate(dateStr);
  const calEvents    = await getCalendarEvents(dateStr);

  const now = new Date();
  
  // JST基準での現在時刻・日付を取得
  const jstParts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(now);

  let y, m, d, hh, mm;
  for (const p of jstParts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
    if (p.type === 'hour') hh = parseInt(p.value);
    if (p.type === 'minute') mm = parseInt(p.value);
  }
  
  const todayStr = `${y}-${m}-${d}`;
  const nowMinutes = (dateStr === todayStr) ? (hh * 60 + mm + 60) : 0;

  const lastStart = BUSINESS_END - duration;
  const available = [];

  for (let t = BUSINESS_START; t <= lastStart; t += SLOT_INTERVAL) {
    if (t < nowMinutes) continue;
    const slotEnd = t + duration;
    let isAvailable = true;

    // スプレッドシート側の予約チェック
    for (const row of reservations) {
      if (t < timeToMinutes(row[2]) && slotEnd > timeToMinutes(row[1])) {
        isAvailable = false; break;
      }
    }
    // Googleカレンダー側の予約チェック
    if (isAvailable) {
      for (const event of calEvents) {
        if (t < event.end && slotEnd > event.start) {
          isAvailable = false; break;
        }
      }
    }
    if (isAvailable) available.push(minutesToTime(t));
  }
  return available;
}

/** 予約を保存 */
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
      values: [[date, time, endTime, menuName, duration, name, userId, now, '確定']],
    },
  });

  // Googleカレンダーに自動追加
  try {
    const calendar = await getCalendar();
    await calendar.events.insert({
      calendarId: config.CALENDAR_ID,
      requestBody: {
        summary: `【LINE予約】${name}様 (${menuName})`,
        description: `LINEからの予約です。\nお名前: ${name}様\n時間: ${duration}分`,
        start: { dateTime: `${date}T${time}:00+09:00`, timeZone: 'Asia/Tokyo' },
        end:   { dateTime: `${date}T${endTime}:00+09:00`, timeZone: 'Asia/Tokyo' },
      },
    });
  } catch (err) {
    console.error('⚠️ カレンダー追加失敗:', err.message);
  }

  return endTime;
}

module.exports = { getAvailableSlots, saveBooking, ensureHeaders };
