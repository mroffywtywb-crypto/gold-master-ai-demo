// ===== وضعیت =====
let running = false;
let balance = 10000;
let trades = [];
let lastPrice = null;
let openTrade = null;
let candles = [];
let intervalId = null;

// ===== عناصر =====
const $ = id => document.getElementById(id);
const balanceEl = $('balance'), pnlEl = $('pnl'), priceEl = $('price');
const tradesCountEl = $('trades-count'), statusEl = $('status');
const startBtn = $('start-btn'), stopBtn = $('stop-btn');
const tradesBody = $('trades-body');

// ===== چارت =====
const chart = LightweightCharts.createChart($('chart-container'), {
  width: $('chart-container').clientWidth,
  height: 380,
  layout: { background: { color: '#1e222d' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
  timeScale: { timeVisible: true },
});
const candleSeries = chart.addCandlestickSeries({
  upColor: '#26a69a', downColor: '#ef5350',
  borderUpColor: '#26a69a', borderDownColor: '#ef5350',
  wickUpColor: '#26a69a', wickDownColor: '#ef5350',
});
window.addEventListener('resize', () => chart.applyOptions({ width: $('chart-container').clientWidth }));

// ===== دریافت داده تاریخی از Twelve Data (کلید رایگان) =====
// ⚠️ کلید API خودت رو اینجا بذار (ثبت‌نام رایگان در twelvedata.com)
const API_KEY = 'YOUR_API_KEY_HERE';
const SYMBOL = 'XAU/USD';

async function loadHistory() {
  const url = `https://api.twelvedata.com/time_series?symbol=${SYMBOL}&interval=1h&outputsize=200&apikey=${API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);
    candles = data.values.reverse().map(v => ({
      time: Math.floor(new Date(v.datetime).getTime() / 1000),
      open: +v.open, high: +v.high, low: +v.low, close: +v.close,
    }));
    candleSeries.setData(candles);
    chart.timeScale().fitContent();
    lastPrice = candles[candles.length - 1].close;
    priceEl.textContent = lastPrice.toFixed(2);
  } catch (e) {
    console.error('خطا در دریافت داده:', e);
    alert('خطا در دریافت داده: ' + e.message + '\nکلید API رو چک کن.');
  }
}

// ===== استراتژی ساده: MA crossover =====
function sma(arr, period) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    const slice = arr.slice(i - period + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function checkSignal() {
  if (candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const fast = sma(closes, 10);
  const slow = sma(closes, 30);
  const i = closes.length - 1;
  if (fast[i] === null || slow[i] === null || fast[i-1] === null || slow[i-1] === null) return null;
  // کراس صعودی
  if (fast[i-1] <= slow[i-1] && fast[i] > slow[i]) return 'buy';
  // کراس نزولی
  if (fast[i-1] >= slow[i-1] && fast[i] < slow[i]) return 'sell';
  return null;
}

// ===== مدیریت معاملات =====
function openPosition(type) {
  if (openTrade) return;
  const price = lastPrice;
  const sl = type === 'buy' ? price - 5 : price + 5;
  const tp = type === 'buy' ? price + 10 : price - 10;
  openTrade = { type, entry: price, sl, tp, time: Date.now() };
  addTradeRow(openTrade, 'باز');
}

function closePosition(reason) {
  if (!openTrade) return;
  const exit = lastPrice;
  const diff = openTrade.type === 'buy' ? exit - openTrade.entry : openTrade.entry - exit;
  const pnl = diff * 10; // هر ۱ دلار حرکت = ۱۰ دلار سود برای حجم فرضی
  balance += pnl;
  openTrade.exit = exit;
  openTrade.pnl = pnl;
  openTrade.reason = reason;
  trades.push(openTrade);
  updateTradeRow(openTrade);
  openTrade = null;
  updateStats();
}

function manageOpenTrade() {
  if (!openTrade) return;
  const p = lastPrice;
  if (openTrade.type === 'buy') {
    if (p <= openTrade.sl) closePosition('SL');
    else if (p >= openTrade.tp) closePosition('TP');
  } else {
    if (p >= openTrade.sl) closePosition('SL');
    else if (p <= openTrade.tp) closePosition('TP');
  }
}

// ===== رندر جدول =====
let rowId = 0;
function addTradeRow(t, state) {
  const tr = document.createElement('tr');
  tr.id = 'trade-' + (++rowId);
  t._rowId = tr.id;
  tr.innerHTML = `
    <td>${trades.length + 1}</td>
    <td class="${t.type}">${t.type === 'buy' ? 'خرید' : 'فروش'}</td>
    <td>${t.entry.toFixed(2)}</td>
    <td>—</td>
    <td>—</td>
    <td>${state}</td>`;
  tradesBody.appendChild(tr);
  const empty = tradesBody.querySelector('.empty');
  if (empty) empty.parentElement.remove();
}

function updateTradeRow(t) {
  const tr = document.getElementById(t._rowId);
  if (!tr) return;
  tr.children[3].textContent = t.exit.toFixed(2);
  tr.children[4].textContent = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2);
  tr.children[4].style.color = t.pnl >= 0 ? '#26a69a' : '#ef5350';
  tr.children[5].textContent = t.reason;
}

function updateStats() {
  balanceEl.textContent = '$' + balance.toFixed(2);
  const totalPnl = balance - 10000;
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2);
  pnlEl.style.color = totalPnl >= 0 ? '#26a69a' : '#ef5350';
  tradesCountEl.textContent = trades.length;
}

// ===== شبیه‌سازی قیمت (چون API رایگان استریم نداره) =====
function tick() {
  if (!running) return;
  // نوسان تصادفی ±0.3 دلار حول آخرین قیمت
  const delta = (Math.random() - 0.5) * 0.6;
  lastPrice = +(lastPrice + delta).toFixed(2);
  priceEl.textContent = lastPrice.toFixed(2);

  // کندل جدید هر ۵ ثانیه (شبیه‌سازی)
  const now = Math.floor(Date.now() / 1000);
  const lastCandle = candles[candles.length - 1];
  if (now - lastCandle.time >= 5) {
    const newCandle = { time: now, open: lastPrice, high: lastPrice, low: lastPrice, close: lastPrice };
    candles.push(newCandle);
    candleSeries.update(newCandle);
  } else {
    lastCandle.close = lastPrice;
    lastCandle.high = Math.max(lastCandle.high, lastPrice);
    lastCandle.low = Math.min(lastCandle.low, lastPrice);
    candleSeries.update(lastCandle);
  }

  manageOpenTrade();
  if (!openTrade) {
    const sig = checkSignal();
    if (sig) openPosition(sig);
  }
}

// ===== دکمه‌ها =====
startBtn.onclick = async () => {
  if (!candles.length) await loadHistory();
  if (!lastPrice) return alert('داده لود نشد.');
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = 'RUNNING';
  statusEl.style.color = '#26a69a';
  intervalId = setInterval(tick, 1000);
};

stopBtn.onclick = () => {
  running = false;
  clearInterval(intervalId);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'STOPPED';
  statusEl.style.color = '#ef5350';
};

// ===== شروع اولیه =====
loadHistory();