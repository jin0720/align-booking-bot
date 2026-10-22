// src/i18n/ja.js - お客様向け文言 (日本語)
const { formatDateJP } = require('../utils');

const LIFF_URL = 'https://liff.line.me/2009962690-j5dQBfYL';

module.exports = {
  lang: 'ja',

  // ─── 表示用の整形 ──────────────────────────────────────
  formatDate: (dateStr) => formatDateJP(dateStr),
  duration: (n) => `${n}分`,
  greetName: (name) => (name ? `${name}さん、` : ''),
  liffUrl: (query) => (query ? `${LIFF_URL}?${query}` : LIFF_URL),

  menuNames: {
    oil: 'オイルマッサージ',
    seitai: '整体',
    oil_first: '初回オイルマッサージ(1000円OFF)',
    seitai_first: '初回整体(1000円OFF)',
    training: 'パーソナルトレーニング',
    training_early: '早朝パーソナル(6時〜9時スタート)',
    training_first: '初回パーソナルトレーニング(2000円OFF)',
  },
  gyms: null, // null = config.GYM_LOCATIONS をそのまま使う

  // ─── 汎用 ───────────────────────────────────────────────
  genericError: '処理中にエラーが発生しました。しばらくしてから再度お試しください。',
  userIdText: (id) => `あなたのLINE User IDは：\n${id}`,
  resetDone: '🔄 操作をリセットしました。\n\n「マッサージ予約」と送ると予約を再開できます。',

  // ─── マッサージ予約カード ──────────────────────────────
  liffCard: {
    altText: 'マッサージのご予約',
    header: 'マッサージのご予約',
    note: '※「予約する」をタップすると当店公式の予約フォームが開きます（初回のみ許可が必要です）。LINEのお名前を自動入力するため、プロフィール情報へのアクセス許可をお願いします。',
    button: '予約する',
  },

  // ─── 予約の確認・キャンセル案内 ─────────────────────────
  reservationCheck: {
    altText: '予約の確認・変更・キャンセル',
    title: '📅 予約の確認・変更・キャンセル',
    body: 'ミニアプリで予約一覧を確認できます。\n日時変更は一度キャンセル後、再度ご予約ください。',
    button: '予約確認・キャンセルはこちら',
  },

  // ─── トレーニング案内 ──────────────────────────────────
  trainingEntry: {
    altText: (greet) => `${greet}パーソナルトレーニングへようこそ！`,
    header: (greet) => `🏋️ ${greet}パーソナルトレーニングへようこそ！`,
    body1: '完全個室のレンタルジムでマンツーマン指導✨',
    body2: 'どちらからご利用ですか？',
    trialButton: '体験してみる 初回2,000円OFF',
    consultButton: 'まずは相談する',
  },

  // ─── トレーニング目標 ──────────────────────────────────
  goalLabels: null, // null = 目標の日本語キーをそのまま表示
  goalOther: 'その他（自由入力）',
  goalDone: '✅ 選択完了',
  goalStartHeader: 'あなたの目標を教えてください！\n複数選択できます😊',
  goalSelectedHeader: (goal) => `✓「${goal}」を選択しました！\n他の目標も選べます😊`,
  goalFreetextPrompt: 'どのような目標か、チャットで教えてください😊',
  noGoals: '目標は特になし',
  noAnswer: '（未回答）',

  nextAction: {
    altText: '目標が決まりました！次のステップを選んでください。',
    header: '🎯 選択された目標',
    prompt: '次のステップを選んでください😊',
    bookNow: '今すぐ予約する',
    waitReply: 'トレーナーからの返信を待つ',
  },
  waitReplyAck: 'ご回答ありがとうございます！\nトレーナーより折り返しご連絡いたします。\n少々お待ちください😊',

  // ─── オーナー操作 → お客様への送信 ─────────────────────
  gymConfirm: {
    altText: '✅ トレーニング予約が確定しました',
    header: '✅ トレーニング予約が確定しました',
    session: (n) => `⏱ パーソナルトレーニング ${n}分`,
    gymTitle: '📍 ご利用ジム',
    mapButton: 'Googleマップで開く',
    note: '※ 動きやすい服装でお越しください😊',
  },
  proposeTime: {
    altText: '⏰ トレーナーより時間変更のご提案',
    header: '⏰ トレーナーより時間変更のご提案',
    footer: '上記の日程でよろしければ下のボタンから再予約をお願いします😊',
    button: '再予約する（ミニアプリ）',
  },

  // ─── 予約確定メッセージ (API) ───────────────────────────
  bookingConfirm: ({ menuName, duration, price, dateText, time, endTime, name }) => (
    `🎉 ご予約が確定しました！\n\n` +
    `【予約内容】\n` +
    `📋 ${menuName}\n` +
    `⏱ ${duration}分コース\n` +
    (price ? `💴 ¥${price.discounted.toLocaleString()}\n` : '') +
    `📅 ${dateText}\n` +
    `🕐 ${time}〜${endTime}\n` +
    `👤 ${name} 様\n\n` +
    `ご来店を心よりお待ちしております✨\n\n` +
    `※サロンの最寄駅は東高円寺(1番出口)から徒歩3分になります。詳細は後ほどご連絡いたしますので少々お待ちください。\n\n` +
    `【キャンセルについて】\n` +
    `前日23時まで：無料\n` +
    `それ以降（当日キャンセル）：全額\n\n` +
    `※前日23時以降のキャンセルは全額を頂戴いたします。`
  ),

  location: {
    today: '本日',
    tomorrow: '明日',
    otherDay: (m, d) => `${m}月${d}日`,
    text: ({ name, dayLabel, time }) => (
      `${name}さん、ご予約ありがとうございます！\n\n` +
      `【サロン場所】\nhttps://maps.app.goo.gl/PHNZoRidbwHHJmAA8?g_st=ipc\n\n` +
      `2階に上がったA号室になります。\n` +
      `${dayLabel}${time}ごろお待ちしてます😊\n\n` +
      `※自転車でお越しの際は、ご連絡いただけますようお願いいたします。\n\n` +
      `【ご来店・ご退店の際のお願い】\n` +
      `ご来店・ご退店の際は、近隣へのご配慮のため、静かにご入退店いただけますと幸いです。\n` +
      `ご入室後は、通常どおりお話しいただいて問題ございません。\n\n` +
      `ご理解とご協力のほど、よろしくお願いいたします🙇`
    ),
  },

  trainingPending: ({ dateText, time, endTime, duration, deadlineHour }) => (
    `⏳ トレーニングの仮予約を受け付けました！\n\n` +
    `📅 ${dateText}　${time}〜${endTime}\n` +
    `⏱ パーソナルトレーニング ${duration}分\n\n` +
    `トレーナーがレンタルジムの空きを確認後、前日${deadlineHour}時までにLINEでご連絡します。\n\n` +
    `確定後にジムの場所をお知らせします📍`
  ),

  // ─── API レスポンスのメッセージ ─────────────────────────
  api: {
    menusFailed: 'メニュー取得に失敗しました',
    availabilityRequired: '日付 (date) と時間 (duration) が必須です',
    dateFormatInvalid: '日付形式が不正です (YYYY-MM-DD)',
    availabilityFailed: '可用枠の取得に失敗しました',
    fieldsMissing: '必須フィールドが不足しています',
    trainingDeadline: (h) => `トレーニング予約は前日${h}時までにお申し込みください。`,
    slotTaken: null, // null = サーバー側の文言をそのまま返す
    trainingReceived: '仮予約を受け付けました',
    bookingConfirmed: '予約が確定しました',
    bookingFailed: '予約の作成に失敗しました',
    cancelFieldsMissing: '日付、時間、名前が必須です',
    cancelDeadlinePassed: '前日23時を過ぎているため、キャンセルできません。',
    cancelled: '予約がキャンセルされました',
    cancelFailed: '予約のキャンセルに失敗しました',
    historyFailed: '予約履歴の取得に失敗しました',
  },
};
