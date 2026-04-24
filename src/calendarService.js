// src/calendarService.js - Google Calendar 連携
const { google } = require('googleapis');
const config = require('./config');

let _calendar = null;

/** Google Calendar クライアントを返す (シングルトン) */
async function getCalendar() {
  if (_calendar) return _calendar;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  }
  
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  _calendar = google.calendar({ version: 'v3', auth });
  return _calendar;
}

/**
 * 指定日の予定一覧を取得
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {Array} events [{ start, end }] (分換算)
 */
async function getCalendarEventsForDate(dateStr) {
  if (!config.CALENDAR_ID) return [];
  
  const calendar = await getCalendar();
  const timeMin = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

  const res = await calendar.events.list({
    calendarId: config.CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
  });

  const events = res.data.items || [];
  return events.map(event => {
    const start = event.start.dateTime || event.start.date;
    const end   = event.end.dateTime   || event.end.date;
    
    // YYYY-MM-DD 形式（終日予定）の場合は一日中
    if (start.length === 10) {
      return { start: 0, end: 24 * 60 };
    }

    const startDate = new Date(start);
    const endDate   = new Date(end);
    
    return {
      start: startDate.getHours() * 60 + startDate.getMinutes(),
      end:   endDate.getHours()   * 60 + endDate.getMinutes(),
      summary: event.summary
    };
  });
}

/**
 * 予約をカレンダーに追加
 */
async function addEventToCalendar({ date, time, endTime, menuName, name }) {
  if (!config.CALENDAR_ID) return;

  const calendar = await getCalendar();
  const startDateTime = `${date}T${time}:00+09:00`;
  const endDateTime   = `${date}T${endTime}:00+09:00`;

  await calendar.events.insert({
    calendarId: config.CALENDAR_ID,
    requestBody: {
      summary: `【LINE予約】${name}様 (${menuName})`,
      description: `LINEからの自動予約です。\nお名前: ${name}様\nメニュー: ${menuName}`,
      start: { dateTime: startDateTime, timeZone: 'Asia/Tokyo' },
      end:   { dateTime: endDateTime,   timeZone: 'Asia/Tokyo' },
    },
  });
  console.log(`📅 Googleカレンダーに予定を追加しました: ${date} ${time}`);
}

module.exports = { getCalendarEventsForDate, addEventToCalendar };
