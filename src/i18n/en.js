// src/i18n/en.js - お客様向け文言 (英語)。キー構造は ja.js と同一
const LIFF_URL = 'https://liff.line.me/2009962690-j5dQBfYL';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 24時間表記の「時」→ "10 PM" 形式 */
function hourText(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

module.exports = {
  lang: 'en',

  // ─── 表示用の整形 ──────────────────────────────────────
  formatDate: (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${DAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}`;
  },
  duration: (n) => `${n} min`,
  greetName: (name) => (name ? `Hi ${name}, ` : ''),
  // lang=en を付けるとミニアプリが英語で開く
  liffUrl: (query) => `${LIFF_URL}?${query ? `${query}&` : ''}lang=en`,

  menuNames: {
    oil: 'Oil Massage',
    seitai: 'Seitai (Body Alignment)',
    oil_first: 'First-time Oil Massage (¥1,000 OFF)',
    seitai_first: 'First-time Seitai (¥1,000 OFF)',
    training: 'Personal Training',
    training_early: 'Early Morning Personal Training (starts 6-9 AM)',
    training_first: 'First-time Personal Training (¥2,000 OFF)',
  },
  gyms: [
    {
      label: '(1) 1 min walk from Nakano Station North Exit',
      name: 'City Plaza Nakano #205',
      access: '1 min walk from the North Exit of Nakano Station',
      address: 'City Plaza Nakano #205, 5-32-11 Nakano, Nakano-ku, Tokyo 164-0001',
    },
    {
      label: '(2) 4 min walk from Nakano Station South Exit',
      name: 'Ayabe Building 2F (Nakano Rental Gym)',
      access: '4 min walk from the South Exit of Nakano Station',
      address: 'Ayabe Building 2F, 3-32-10 Nakano, Nakano-ku, Tokyo 164-0001',
    },
    {
      label: '(3) 4 min walk from Nakano-Sakaue Station Exit A1',
      name: 'Access Yodobashi Room 7D',
      access: '4 min walk from Exit A1 of Nakano-Sakaue Station',
      address: 'Access Yodobashi Room 7D, 1-14-10 Honcho, Nakano-ku, Tokyo 164-0012',
    },
  ],

  // ─── 汎用 ───────────────────────────────────────────────
  genericError: 'An error occurred. Please try again later.',
  userIdText: (id) => `Your LINE User ID:\n${id}`,
  resetDone: '🔄 Your session has been reset.\n\nSend "book" to start your booking again.',

  // ─── マッサージ予約カード ──────────────────────────────
  liffCard: {
    altText: 'Massage booking',
    header: 'Massage Booking',
    note: '* Tapping "Book now" opens our official booking form (permission is required the first time). To fill in your LINE name automatically, please allow access to your profile.',
    button: 'Book now',
  },

  // ─── 予約の確認・キャンセル案内 ─────────────────────────
  reservationCheck: {
    altText: 'View, change or cancel your booking',
    title: '📅 View / Change / Cancel',
    body: 'You can check your bookings in our mini app.\nTo change the date or time, please cancel and book again.',
    button: 'My bookings',
  },

  // ─── トレーニング案内 ──────────────────────────────────
  trainingEntry: {
    altText: (greet) => `${greet}welcome to Personal Training!`,
    header: (greet) => `🏋️ ${greet ? `${greet}welcome` : 'Welcome'} to Personal Training!`,
    body1: 'One-on-one coaching in a fully private rental gym✨',
    body2: 'How would you like to get started?',
    trialButton: 'Try it (¥2,000 OFF)',
    consultButton: 'Ask first',
  },

  // ─── トレーニング目標 ──────────────────────────────────
  // キーは日本語の目標文 (シート・オーナー通知は日本語で保存するため)
  // ボタンのラベルは LINE の制限(20文字)に収まるよう、「✓ 」を付けても20文字以内にする
  goalLabels: {
    '筋肉をつけて身体大きくしたい': 'Build muscle',
    '腹筋を割りたい': 'Get visible abs',
    '健康的に痩せたい': 'Lose weight',
    '健康的な身体になりたい': 'Be healthier',
    '運動不足を解消したい': 'Get more active',
  },
  goalOther: 'Other (type it)',
  goalDone: '✅ Done',
  goalStartHeader: 'Tell us your goals!\nYou can choose more than one 😊',
  goalSelectedHeader: (goal) => `✓ "${goal}" selected!\nYou can choose other goals too 😊`,
  goalFreetextPrompt: 'Please tell us your goal in the chat 😊',
  noGoals: 'No specific goals',
  noAnswer: '(no answer)',

  nextAction: {
    altText: 'Your goals are set! Please choose your next step.',
    header: '🎯 Your selected goals',
    prompt: 'Please choose your next step 😊',
    bookNow: 'Book now',
    waitReply: 'Wait for a reply',
  },
  waitReplyAck: 'Thank you for your answers!\nThe trainer will get back to you shortly.\nPlease wait a moment 😊',

  // ─── オーナー操作 → お客様への送信 ─────────────────────
  gymConfirm: {
    altText: '✅ Your training session is confirmed',
    header: '✅ Your training session is confirmed',
    session: (n) => `⏱ Personal Training - ${n} min`,
    gymTitle: '📍 Your gym',
    mapButton: 'Open in Google Maps',
    note: '* Please wear comfortable clothes 😊',
  },
  proposeTime: {
    altText: '⏰ Your trainer suggests a new time',
    header: '⏰ Your trainer suggests a new time',
    footer: 'If the schedule above works for you, please book again with the button below 😊',
    button: 'Book again',
  },

  // ─── 予約確定メッセージ (API) ───────────────────────────
  bookingConfirm: ({ menuName, duration, price, dateText, time, endTime, name }) => (
    `🎉 Your booking is confirmed!\n\n` +
    `Booking details\n` +
    `📋 ${menuName}\n` +
    `⏱ ${duration}-min course\n` +
    (price ? `💴 ¥${price.discounted.toLocaleString()}\n` : '') +
    `📅 ${dateText}\n` +
    `🕐 ${time}-${endTime}\n` +
    `👤 ${name}\n\n` +
    `We look forward to seeing you ✨\n\n` +
    `* The salon is a 3-minute walk from Higashi-Koenji Station (Exit 1). We will send you detailed directions shortly, so please wait a moment.\n\n` +
    `Cancellation policy\n` +
    `Until 11 PM the day before: free\n` +
    `After that (same-day cancellation): full charge\n\n` +
    `* Cancellations made after 11 PM the day before are charged in full.`
  ),

  location: {
    today: 'today',
    tomorrow: 'tomorrow',
    otherDay: (m, d) => `on ${MONTHS[m - 1]} ${d}`,
    text: ({ name, dayLabel, time }) => (
      `Hi ${name}, thank you for your booking!\n\n` +
      `Salon location\nhttps://maps.app.goo.gl/PHNZoRidbwHHJmAA8?g_st=ipc\n\n` +
      `It is Room A, up the stairs on the 2nd floor.\n` +
      `We look forward to seeing you ${dayLabel} around ${time} 😊\n\n` +
      `* If you are coming by bicycle, please let us know in advance.\n\n` +
      `When arriving and leaving\n` +
      `Out of consideration for our neighbors, please enter and leave quietly.\n` +
      `Once inside the room, you are welcome to talk as usual.\n\n` +
      `Thank you for your understanding and cooperation 🙇`
    ),
  },

  trainingPending: ({ dateText, time, endTime, duration, deadlineHour }) => (
    `⏳ We have received your training reservation request!\n\n` +
    `📅 ${dateText}  ${time}-${endTime}\n` +
    `⏱ Personal Training - ${duration} min\n\n` +
    `The trainer will check rental gym availability and contact you via LINE by ${hourText(deadlineHour)} the day before.\n\n` +
    `We will let you know the gym location once your session is confirmed 📍`
  ),

  // ─── API レスポンスのメッセージ ─────────────────────────
  api: {
    menusFailed: 'Failed to load the menu',
    availabilityRequired: 'date and duration are required',
    dateFormatInvalid: 'Invalid date format (YYYY-MM-DD)',
    availabilityFailed: 'Failed to load availability',
    fieldsMissing: 'Required fields are missing',
    trainingDeadline: (h) => `Training sessions must be booked by ${hourText(h)} the day before.`,
    slotTaken: 'Sorry, that time has just been taken. Please choose another time.',
    trainingReceived: 'Your reservation request has been received',
    bookingConfirmed: 'Your booking is confirmed',
    bookingFailed: 'Failed to create your booking',
    cancelFieldsMissing: 'Date, time and name are required',
    cancelDeadlinePassed: 'Sorry, bookings cannot be cancelled after 11 PM the day before.',
    cancelled: 'Your booking has been cancelled',
    cancelFailed: 'Failed to cancel your booking',
    historyFailed: 'Failed to load your booking history',
  },
};
