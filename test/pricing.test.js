const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');

const before = new Date('2026-11-14T23:59:59+09:00');
const after = new Date('2026-11-15T00:00:00+09:00');
const orig = (m, d, at) => config.getPrice(m, d, at).original;
const disc = (m, d, at) => config.getPrice(m, d, at).discounted;

test('11/14 23:59:59 JST は旧料金', () => {
  for (const m of ['oil', 'seitai']) {
    assert.deepStrictEqual([70, 100, 130, 160].map(d => disc(m, d, before)), [10000, 13000, 16000, 19000]);
  }
});

test('11/15 00:00:00 JST から新料金', () => {
  for (const m of ['oil', 'seitai']) {
    assert.deepStrictEqual([70, 100, 130, 160].map(d => disc(m, d, after)), [10000, 14000, 18000, 22000]);
  }
});

test('UTC表記でも境界はJST基準 (11/14 14:59:59Z=旧 / 15:00:00Z=新)', () => {
  assert.strictEqual(disc('oil', 160, new Date('2026-11-14T14:59:59Z')), 19000);
  assert.strictEqual(disc('oil', 160, new Date('2026-11-14T15:00:00Z')), 22000);
});

test('初回割引は定価-1,000円で切替に追従', () => {
  assert.strictEqual(disc('oil_first', 100, before), 12000);
  assert.strictEqual(disc('oil_first', 100, after), 13000);
  assert.strictEqual(disc('seitai_first', 160, after), 21000);
});

test('トレーニング料金は変更なし', () => {
  for (const at of [before, after]) {
    assert.strictEqual(disc('training', 60, at), 10000);
    assert.strictEqual(disc('training_early', 80, at), 10000);
    assert.strictEqual(disc('training_first', 90, at), 11000);
  }
});

test('表示用 PRICES/FIRST_TIME_PRICES と getPrice が現在時刻で一致', () => {
  for (const d of [70, 100, 130, 160]) {
    assert.deepStrictEqual(config.PRICES[d], config.getPrice('oil', d));
    assert.deepStrictEqual(config.FIRST_TIME_PRICES[d], config.getPrice('oil_first', d));
  }
});

test('時刻を進めると PRICES getter も新料金になる (実時刻モック)', () => {
  const RealDate = Date;
  const fake = t => class extends RealDate { constructor(...a) { a.length ? super(...a) : super(t); } static now() { return new RealDate(t).getTime(); } };
  try {
    global.Date = fake('2026-11-14T23:59:59+09:00');
    assert.strictEqual(config.PRICES[160].discounted, 19000);
    global.Date = fake('2026-11-15T00:00:00+09:00');
    assert.strictEqual(config.PRICES[160].discounted, 22000);
    assert.strictEqual(config.FIRST_TIME_PRICES[100].discounted, 13000);
  } finally { global.Date = RealDate; }
});
