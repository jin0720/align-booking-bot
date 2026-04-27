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
      maxResults: 100, // 多すぎると重くなるため制限
    }, {
      timeout: 10000, // 10秒でタイムアウト
    });

    const events = res.data.items || [];
    console.log(`✅ [getCalendarEvents] ${dateStr} のカレンダーから ${events.length} 件取得しました。`);

    if (dateStr === '2026-04-30') {
      // 4/30の問題調査のため、生データをログ出力
      console.log('📝 [DEBUG 4/30] Raw Events:', JSON.stringify(events.map(e => ({
        summary: e.summary,
        start: e.start,
        end: e.end,
        status: e.status
      }))));
    }

    return events.map(e => {
      try {
        let start, end;
        if (e.start.dateTime) {
          const startDate = new Date(e.start.dateTime);
          const endDate   = new Date(e.end.dateTime);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn(`⚠️ [getCalendarEvents] 無効な日時イベントをスキップ: ${e.summary}`);
            return null;
          }

          const getJSTTime = (date) => {
            const parts = new Intl.DateTimeFormat('ja-JP', {
              timeZone: 'Asia/Tokyo',
              hour: 'numeric', minute: 'numeric', hour12: false
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
        } else if (e.start.date) {
          // 終日予定
          start = 0;
          end   = 1440;
        } else {
          return null;
        }
        
        return { start, end, summary: e.summary };
      } catch (err) {
        console.error(`⚠️ [getCalendarEvents] イベント処理中にエラー (スキップ):`, err.message);
        return null;
      }
    }).filter(e => e !== null);
  } catch (err) {
    console.error(`❌ [getCalendarEvents] カレンダー取得失敗 (${dateStr}):`, err.message);
    // 権限エラーやネットワークエラーでも空のリストを返して処理は止めない
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
  
  // 空き時間の判定はGoogleカレンダーを唯一のソースとする
  // (スプレッドシートはログ・記録用とし、カレンダーから削除すれば予約可能になるようにする)
  const calEvents = await getCalendarEvents(dateStr);

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

    // Googleカレンダー側の予約チェック
    for (const event of calEvents) {
      if (t < event.end && slotEnd > event.start) {
        isAvailable = false;
        break;
      }
    }

    if (isAvailable) available.push(minutesToTime(t));
    if (t > 24*60) {
      console.error('⛔️ 無限ループ防止: tが24時間を超えました');
      break;
    }
  }
  console.log(`📊 [getAvailableSlots] 結果: ${available.length} 件の空きスロット (${dateStr}, ${duration}分)`);
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

/** ユーザーの未来の予約を取得 */
async function getUserReservations(userId) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:I`,
  });
  const rows = res.data.values || [];
  const now = new Date();
  
  // 今日より後の予約、または今日の予約でまだ開始時間前のものをフィルタ
  // (キャンセルルールのために昨日23時以降も含める必要があるが、基本は未来の予約が対象)
  return rows.slice(1).map((row, index) => ({
    rowIndex: index + 2, // 1-indexed header + 1-indexed spreadsheet
    date: row[0],
    time: row[1],
    endTime: row[2],
    menu: row[3],
    duration: row[4],
    name: row[5],
    userId: row[6],
    status: row[8],
  })).filter(r => r.userId === userId && r.status === '確定');
}

/** 予約をキャンセル */
async function cancelBooking({ rowIndex, date, time, name }) {
  const sheets = await getSheets();
  
  // 1. スプレッドシートのステータスを更新
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!I${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['キャンセル']],
    },
  });

  // 2. Googleカレンダーから削除
  try {
    const calendar = await getCalendar();
    const timeMin = `${date}T${time}:00+09:00`;
    const timeMax = `${date}T${time}:01+09:00`; // ほぼピンポイントで検索

    const res = await calendar.events.list({
      calendarId: config.CALENDAR_ID,
      timeMin,
      timeMax,
      q: name, // 名前で絞り込み
      singleEvents: true,
    });

    const events = res.data.items || [];
    // 完全に一致するものを探す
    const targetEvent = events.find(e => 
      e.summary.includes(name) && 
      e.start.dateTime.startsWith(`${date}T${time}`)
    );

    if (targetEvent) {
      await calendar.events.delete({
        calendarId: config.CALENDAR_ID,
        eventId: targetEvent.id,
      });
      console.log(`✅ カレンダーイベント削除完了: ${targetEvent.id}`);
    } else {
      console.warn(`⚠️ キャンセル対象のカレンダーイベントが見つかりませんでした (${date} ${time} ${name})`);
    }
  } catch (err) {
    console.error('⚠️ カレンダー削除失敗:', err.message);
  }
}

module.exports = { getAvailableSlots, saveBooking, ensureHeaders, getUserReservations, cancelBooking };
