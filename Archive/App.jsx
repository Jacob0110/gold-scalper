// // App.jsx  PART 1/3  – imports + helpers + state

// import React, { useEffect, useRef, useState } from "react";
// import {
//   createChart,
//   ColorType,
//   CandlestickSeries,
//   HistogramSeries,
//   LineSeries,
// } from "lightweight-charts";
// import { CONFIG } from "./config";

// const { createClient } = window.supabase || { createClient: () => null };
// const supabase = window.supabase
//   ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
//   : null;
// const STRATEGY = CONFIG.STRATEGY;

// // ---------- indicator helpers ----------
// // 風險管理：用 risk% + 槓桿 + hard cap 決定倉位
// const calcJinguoSize = ({
//   capital,
//   riskPct,
//   leverage,
//   entry,
//   stop,
//   hardSizeCap = 5, // 每單最大 size，可之後做 UI
// }) => {
//   const riskAmt = capital * (riskPct / 100); // 每單 dollar risk
//   const riskPerUnit = Math.abs(entry - stop) || 0.1; // 防止除 0

//   const rawSize = riskAmt / riskPerUnit;
//   const maxSizeByLev = (capital * leverage) / entry;

//   const size = Math.min(rawSize, maxSizeByLev, hardSizeCap);

//   return {
//     size: Number(size.toFixed(4)),
//     riskAmt,
//     riskPerUnit,
//   };
// };

// const calculateSMA = (data, period) => {
//   if (!data || data.length === 0) return 0;
//   const slice = data.slice(-Math.min(data.length, period));
//   return (
//     slice.reduce((a, b) => a + (parseFloat(b) || 0), 0) / slice.length || 0
//   );
// };

// const calculateEMA = (data, period) => {
//   if (!data || data.length < period) return [];
//   const k = 2 / (period + 1);
//   let ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
//   for (let i = period; i < data.length; i++) {
//     ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
//   }
//   return new Array(period - 1).fill(null).concat(ema);
// };

// const calculateRSI = (prices, period = 14) => {
//   if (!prices || prices.length < period + 1) return 50;
//   let gains = 0,
//     losses = 0;
//   for (let i = prices.length - period; i < prices.length; i++) {
//     const diff = prices[i] - prices[i - 1];
//     if (diff >= 0) gains += diff;
//     else losses -= diff;
//   }
//   const rs = gains / period / (losses / period || 1);
//   return 100 - 100 / (1 + rs);
// };

// const calculateATR = (highs, lows, closes, period = 14) => {
//   if (!highs || highs.length < period + 1) return 1;
//   const trs = [];
//   for (let i = 1; i < highs.length; i++) {
//     const tr = Math.max(
//       highs[i] - lows[i],
//       Math.abs(highs[i] - closes[i - 1]),
//       Math.abs(lows[i] - closes[i - 1])
//     );
//     trs.push(tr);
//   }
//   const look = trs.slice(-Math.min(trs.length, period));
//   return look.reduce((a, b) => a + b, 0) / look.length || 1;
// };

// const formatHKTime = (ts) =>
//   new Date(ts * 1000).toLocaleTimeString("en-GB", {
//     hour: "2-digit",
//     minute: "2-digit",
//     hour12: false,
//     timeZone: "Asia/Hong_Kong",
//   });

// const toInputFormat = (ts) => {
//   const d = new Date(ts);
//   return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
//     .toISOString()
//     .slice(0, 16);
// };

// function StatCard({ label, value, unit, color, sub, isMain }) {
//   return (
//     <div
//       style={{
//         background: "#18181b",
//         padding: "15px",
//         borderRadius: "8px",
//         border: "1px solid #27272a",
//         display: "flex",
//         flexDirection: "column",
//       }}
//     >
//       <div style={{ fontSize: "0.75rem", color: "#71717a", marginBottom: 5 }}>
//         {label}
//       </div>
//       <div
//         style={{
//           fontSize: isMain ? "2rem" : "1.5rem",
//           fontWeight: 700,
//           color,
//           fontFamily: "'Roboto Mono', monospace",
//         }}
//       >
//         {unit === "$" ? unit : ""}
//         {value}
//         {unit === "x" ? unit : ""}
//         {sub && (
//           <span
//             style={{
//               fontSize: "0.8rem",
//               color,
//               marginLeft: 5,
//               fontWeight: "normal",
//               opacity: 0.8,
//             }}
//           >
//             {sub}
//           </span>
//         )}
//       </div>
//     </div>
//   );
// }

// export default function App() {
//   // chart refs
//   const chartContainerRef = useRef(null);
//   const chartInstanceRef = useRef(null);
//   const candleSeriesRef = useRef(null);
//   const volumeSeriesRef = useRef(null);
//   const emaFastSeriesRef = useRef(null);
//   const emaSlowSeriesRef = useRef(null);
//   const supportLineRef = useRef(null);
//   const resistanceLineRef = useRef(null);
//   const activeSignalRef = useRef(null);
//   const candlesRef = useRef([]); // 所有 K 線 (live + backtest 用)
//   const [supabaseBtResult, setSupabaseBtResult] = useState(null);

//   // live 指標
//   const [marketData, setMarketData] = useState({
//     price: 0,
//     rsi: 0,
//     adx: 0,
//     volFactor: "0.00",
//     emaFast: 0,
//     emaSlow: 0,
//     support: 0,
//     resistance: 0,
//   });

//   // live / signal / history 狀態
//   const [activeSignal, setActiveSignal] = useState(null);

//   // ✅ 分開 liveHistory / backtestHistory
//   const [liveHistory, setLiveHistory] = useState([]);
//   const [backtestHistory, setBacktestHistory] = useState([]);
//   const [historyMode, setHistoryMode] = useState("live"); // 'live' | 'backtest'

//   const [connectionStatus, setConnectionStatus] = useState("連線中...");
//   const [strategyTip, setStrategyTip] = useState("初始化...");
//   const [tradeSetup, setTradeSetup] = useState(null);
//   const [chartReady, setChartReady] = useState(false);
//   const [backtestResult, setBacktestResult] = useState(null);

//   // 資金設定
//   const [capital, setCapital] = useState(1000);
//   const [riskPct, setRiskPct] = useState(2);
//   const [leverage, setLeverage] = useState(1);

//   // UI 控制
//   const [showSettings, setShowSettings] = useState(false);
//   const [showHistory, setShowHistory] = useState(false);
//   const [filterMode, setFilterMode] = useState("preset");
//   const [presetPeriod, setPresetPeriod] = useState(0);
//   const [customRange, setCustomRange] = useState({
//     start: Date.now() - 86400000,
//     end: Date.now(),
//   });

//   useEffect(() => {
//     document.title = "JINGUO V34 回測+實盤";
//   }, []);
//   // ---------- Supabase live history (只管 liveHistory) ----------
//   useEffect(() => {
//     if (!supabase) return;

//     const loadInitial = async () => {
//       const since = new Date(
//         Date.now() - 30 * 24 * 60 * 60 * 1000
//       ).toISOString();
//       const { data } = await supabase
//         .from("trades")
//         .select("*")
//         .gte("entry_time", since)
//         .order("entry_time", { ascending: false });
//       if (data) {
//         setLiveHistory(
//           data.map((d) => ({
//             id: d.id,
//             status: d.status,
//             price: d.entry_price,
//             exitPrice: d.exit_price,
//             exitTime: d.exit_time
//               ? new Date(d.exit_time).toLocaleTimeString("en-GB", {
//                   hour: "2-digit",
//                   minute: "2-digit",
//                 })
//               : "-",
//             time: new Date(d.entry_time).toLocaleString("en-GB", {
//               month: "2-digit",
//               day: "2-digit",
//               hour: "2-digit",
//               minute: "2-digit",
//               hour12: false,
//             }),
//             entryTimeRaw: new Date(d.entry_time).getTime() / 1000,
//             timestamp: new Date(d.entry_time).getTime(),
//           }))
//         );
//       }
//     };

//     loadInitial();

//     // Realtime 只 append -> liveHistory
//     const channel = supabase
//       .channel("trades_live")
//       .on(
//         "postgres_changes",
//         { event: "INSERT", schema: "public", table: "trades" },
//         (payload) => {
//           const d = payload.new;
//           const row = {
//             id: d.id,
//             status: d.status,
//             price: d.entry_price,
//             exitPrice: d.exit_price,
//             exitTime: d.exit_time
//               ? new Date(d.exit_time).toLocaleTimeString("en-GB", {
//                   hour: "2-digit",
//                   minute: "2-digit",
//                 })
//               : "-",
//             time: new Date(d.entry_time).toLocaleString("en-GB", {
//               month: "2-digit",
//               day: "2-digit",
//               hour: "2-digit",
//               minute: "2-digit",
//               hour12: false,
//             }),
//             entryTimeRaw: new Date(d.entry_time).getTime() / 1000,
//             timestamp: new Date(d.entry_time).getTime(),
//           };
//           setLiveHistory((prev) => [row, ...prev]);
//         }
//       )
//       .subscribe();

//     return () => {
//       supabase.removeChannel(channel);
//     };
//   }, []);

//   const recordTrade = async (signal, status, exitPrice, candleTime) => {
//     if (!supabase) return;
//     await supabase.from("trades").insert({
//       type: signal.type,
//       status,
//       entry_price: signal.price,
//       exit_price: exitPrice,
//       tp: signal.tp,
//       sl: signal.sl,
//       entry_time: new Date(signal.timestamp).toISOString(),
//       exit_time: new Date(candleTime * 1000).toISOString(),
//     });
//   };

//   // live markers 只用 liveHistory
//   useEffect(() => {
//     if (!chartReady || !candleSeriesRef.current || liveHistory.length === 0)
//       return;
//     try {
//       const markers = liveHistory
//         .map((t) => ({
//           time: t.entryTimeRaw,
//           position: t.status === "WIN" ? "belowBar" : "aboveBar",
//           color: t.status === "WIN" ? "#4ade80" : "#ef4444",
//           shape: t.status === "WIN" ? "arrowUp" : "arrowDown",
//           text: t.status === "WIN" ? "WIN" : "LOSS",
//         }))
//         .sort((a, b) => a.time - b.time);
//       candleSeriesRef.current.setMarkers(markers);
//     } catch (e) {
//       console.warn("setMarkers error", e);
//     }
//   }, [liveHistory, chartReady]);

//   const updateSupportResistance = (series, candles) => {
//     if (!series || candles.length < STRATEGY.LOOKBACK_PERIOD) return;
//     const recent = candles.slice(-STRATEGY.LOOKBACK_PERIOD);
//     const low = Math.min(...recent.map((c) => c.low));
//     const high = Math.max(...recent.map((c) => c.high));
//     if (supportLineRef.current) series.removePriceLine(supportLineRef.current);
//     if (resistanceLineRef.current)
//       series.removePriceLine(resistanceLineRef.current);
//     resistanceLineRef.current = series.createPriceLine({
//       price: high,
//       color: "#ef4444",
//       lineWidth: 1,
//       lineStyle: 2,
//       axisLabelVisible: true,
//       title: "R",
//     });
//     supportLineRef.current = series.createPriceLine({
//       price: low,
//       color: "#22c55e",
//       lineWidth: 1,
//       lineStyle: 2,
//       axisLabelVisible: true,
//       title: "S",
//     });
//     return { low, high };
//   };

//   const filterCandlesByPeriod = (candles, periodHours) => {
//     if (!candles || candles.length === 0) return [];
//     if (!periodHours || periodHours <= 0) return candles;

//     const lastTime = candles[candles.length - 1].time;
//     const fromTime = lastTime - periodHours * 3600;
//     return candles.filter((c) => c.time >= fromTime);
//   };

//   // ---------- 回測：只寫 backtestHistory ----------
//   const runBacktest = () => {
//     const all = candlesRef.current;
//     if (!all || all.length < 100) return;

//     // 用 periodHours 篩選
//     const usedCandles = filterCandlesByPeriod(
//       all,
//       CONFIG.BACKTEST_PERIOD_HOURS || 0
//     );
//     if (!usedCandles || usedCandles.length < 100) return;

//     let balance = capital;
//     let trades = [];
//     let pendingOrder = null;
//     let activeTrade = null;
//     let equityPoints = [{ time: usedCandles[0].time, balance }];

//     for (let i = 50; i < usedCandles.length; i++) {
//       const candle = usedCandles[i];
//       const h = usedCandles.slice(0, i + 1);
//       const closes = h.map((c) => c.close);
//       const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST).pop();

//       // 有持倉：先處理 TP / SL
//       if (activeTrade) {
//         let closed = false;

//         // 先 check 止賺
//         if (candle.high >= activeTrade.tp) {
//           const exit = Math.max(activeTrade.tp, candle.high); // TP 用較高價
//           const profit = activeTrade.size * (exit - activeTrade.entry); // 正數
//           balance += profit;

//           trades.push({
//             ...activeTrade,
//             exitPrice: exit,
//             status: "WIN",
//             exitTime: candle.time,
//             profit,
//             balanceAfter: balance,
//           });
//           equityPoints.push({ time: candle.time, balance });
//           activeTrade = null;
//           closed = true;
//         }
//         // 再 check 止損
//         else if (candle.low <= activeTrade.sl) {
//           const exit = Math.min(activeTrade.sl, candle.low); // SL 用較低價
//           const profit = activeTrade.size * (exit - activeTrade.entry); // 負數
//           balance += profit;

//           trades.push({
//             ...activeTrade,
//             exitPrice: exit,
//             status: "LOSS",
//             exitTime: candle.time,
//             profit,
//             balanceAfter: balance,
//           });
//           equityPoints.push({ time: candle.time, balance });
//           activeTrade = null;
//           closed = true;
//         }

//         if (closed) continue;
//       }

//       // 有掛單
//       if (pendingOrder) {
//         if (candle.low <= pendingOrder.entry) {
//           activeTrade = pendingOrder;
//           pendingOrder = null;
//         } else if (candle.time - pendingOrder.timestamp / 1000 > 3600) {
//           pendingOrder = null;
//         }
//         continue;
//       }

//       // 新 signal
//       const isGreen = candle.close > candle.open;
//       const isAboveEma = candle.close > emaFast;
//       if (!isGreen || !isAboveEma) continue;

//       const atr = calculateATR(
//         h.map((c) => c.high),
//         h.map((c) => c.low),
//         closes
//       );
//       const bodySize = Math.abs(candle.close - candle.open);
//       const entry = candle.open + bodySize * STRATEGY.RETRACE_RATIO;
//       const stop = candle.low - atr * 0.2;
//       const risk = Math.abs(entry - stop);
//       if (!risk || !Number.isFinite(risk)) continue;

//       const target = entry + risk * STRATEGY.RISK_REWARD;

//       // 用 JINGUO sizer：以當前 balance 計 size
//       const { size } = calcJinguoSize({
//         capital: balance,
//         riskPct,
//         leverage,
//         entry,
//         stop,
//         hardSizeCap: 5,
//       });

//       if (!size || size <= 0) continue;

//       pendingOrder = {
//         entry,
//         sl: stop,
//         tp: target,
//         size,
//         timestamp: candle.time * 1000,
//         type: "BUY",
//       };
//     }

//     const wins = trades.filter((t) => t.status === "WIN");
//     const losses = trades.filter((t) => t.status === "LOSS");

//     const total = wins.length + losses.length;
//     const winRate =
//       total > 0 ? ((wins.length / total) * 100).toFixed(1) : "0.0";

//     const sumWin = wins.reduce(
//       (s, t) => s + t.size * (t.exitPrice - t.entry),
//       0
//     );
//     const sumLoss = losses.reduce(
//       (s, t) => s + t.size * (t.exitPrice - t.entry),
//       0
//     ); // 負數

//     const avgWin = wins.length ? sumWin / wins.length : 0;
//     const avgLoss = losses.length ? sumLoss / losses.length : 0;

//     const pnl = balance - capital;
//     const pnlPct = capital > 0 ? ((pnl / capital) * 100).toFixed(1) : "0.0";

//     const periodSeconds =
//       usedCandles[usedCandles.length - 1].time - usedCandles[0].time;
//     const periodHrsReal = (periodSeconds / 3600).toFixed(1);

//     const p = total > 0 ? wins.length / total : 0;
//     const expectancy = p * avgWin + (1 - p) * avgLoss;

//     setBacktestResult({
//       totalTrades: total,
//       wins: wins.length,
//       losses: losses.length,
//       winRate,
//       pnl: pnl.toFixed(2),
//       pnlPct,
//       finalBalance: balance.toFixed(2),
//       period: periodHrsReal,
//       avgWin: avgWin.toFixed(2),
//       avgLoss: avgLoss.toFixed(2),
//       expectancy: expectancy.toFixed(2),
//     });

//     const simHistory = trades
//       .slice()
//       .reverse()
//       .map((d) => ({
//         status: d.status,
//         price: d.entry.toFixed(2),
//         exitPrice: d.exitPrice.toFixed(2),
//         size: d.size.toFixed(3),
//         profit: d.profit.toFixed(2),
//         balanceAfter: d.balanceAfter.toFixed(2),
//         exitTime: formatHKTime(d.exitTime),
//         time: formatHKTime(d.timestamp / 1000),
//         entryTimeRaw: d.timestamp / 1000,
//         timestamp: d.timestamp,
//       }));

//     setBacktestHistory(simHistory);
//     setHistoryMode("backtest");
//     setShowSettings(false);
//   };

//   // 用 liveHistory / Supabase trades 做 backtest（重播實際成交）
//   // 假設 DB 記錄咗 entry_price / exit_price / entry_time / status
//   const runSupabaseBacktest = (initialCapital, riskPct) => {
//     if (!liveHistory || liveHistory.length === 0) return null;

//     // 按 entryTimeRaw 由舊到新排序
//     const trades = [...liveHistory]
//       .filter((t) => t.exitPrice && !isNaN(t.exitPrice))
//       .sort((a, b) => a.entryTimeRaw - b.entryTimeRaw);

//     if (trades.length === 0) return null;

//     let balance = initialCapital;
//     let equity = [{ time: trades[0].entryTimeRaw, balance }];
//     let winCount = 0;
//     let lossCount = 0;
//     let sumWin = 0;
//     let sumLoss = 0;

//     trades.forEach((t) => {
//       const entry = parseFloat(t.price);
//       const exit = parseFloat(t.exitPrice);
//       if (!entry || !exit) return;

//       // 沒有 SL 的情況，只能用固定 riskAmt / entry 當 size
//       const riskAmt = balance * (riskPct / 100);
//       // 粗略假設 riskPerUnit = entry * 0.003 (0.3%)，你之後可改為用 DB 的 SL
//       const riskPerUnit = entry * 0.003 || 1;
//       const size = riskAmt / riskPerUnit;

//       const profit = size * (exit - entry);
//       balance += profit;

//       const status = profit >= 0 ? "WIN" : "LOSS";
//       if (status === "WIN") {
//         winCount++;
//         sumWin += profit;
//       } else {
//         lossCount++;
//         sumLoss += profit; // 負數
//       }

//       equity.push({ time: t.entryTimeRaw, balance });
//     });

//     const total = winCount + lossCount;
//     const winRate = total > 0 ? ((winCount / total) * 100).toFixed(1) : "0.0";
//     const avgWin = winCount ? sumWin / winCount : 0;
//     const avgLoss = lossCount ? sumLoss / lossCount : 0; // 負數
//     const p = total > 0 ? winCount / total : 0;
//     const expectancy = p * avgWin + (1 - p) * avgLoss;

//     return {
//       totalTrades: total,
//       wins: winCount,
//       losses: lossCount,
//       winRate,
//       pnl: (balance - initialCapital).toFixed(2),
//       finalBalance: balance.toFixed(2),
//       avgWin: avgWin.toFixed(2),
//       avgLoss: avgLoss.toFixed(2),
//       expectancy: expectancy.toFixed(2),
//       equity,
//     };
//   };

//   // ---------- Chart + Realtime (只初始化一次) ----------
//   useEffect(() => {
//     if (!chartContainerRef.current) return;

//     const chart = createChart(chartContainerRef.current, {
//       layout: {
//         background: { type: ColorType.Solid, color: "#09090b" },
//         textColor: "#A1A1AA",
//         fontFamily: "'Roboto Mono', monospace",
//       },
//       grid: {
//         vertLines: { color: "#18181b" },
//         horzLines: { color: "#18181b" },
//       },
//       width: chartContainerRef.current.clientWidth,
//       height: chartContainerRef.current.clientHeight,
//       localization: { timeFormatter: formatHKTime, dateFormat: "yyyy-MM-dd" },
//       timeScale: {
//         timeVisible: true,
//         secondsVisible: false,
//         borderColor: "#27272a",
//         rightOffset: 12,
//         barSpacing: 10,
//         fixLeftEdge: true,
//         tickMarkFormatter: formatHKTime,
//         shiftVisibleRangeOnNewBar: false,
//       },
//       rightPriceScale: {
//         borderColor: "#27272a",
//         scaleMargins: { top: 0.1, bottom: 0.2 },
//         autoScale: true,
//       },
//     });

//     chartInstanceRef.current = chart;
//     candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
//       upColor: "#22c55e",
//       downColor: "#ef4444",
//       wickUpColor: "#22c55e",
//       wickDownColor: "#ef4444",
//       borderVisible: false,
//     });
//     volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
//       priceFormat: { type: "volume" },
//       priceScaleId: "",
//       color: "#eab308",
//     });
//     volumeSeriesRef.current
//       .priceScale()
//       .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
//     emaFastSeriesRef.current = chart.addSeries(LineSeries, {
//       color: "#fbbf24",
//       lineWidth: 1,
//       title: "EMA20",
//     });
//     emaSlowSeriesRef.current = chart.addSeries(LineSeries, {
//       color: "#3b82f6",
//       lineWidth: 1,
//       lineStyle: 2,
//       title: "EMA50",
//     });

//     let ws;

//     const initData = async () => {
//       try {
//         const res = await fetch(
//           "https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=1000"
//         );
//         const raw = await res.json();
//         const hist = raw.map((d) => ({
//           time: d[0] / 1000,
//           open: parseFloat(d[1]),
//           high: parseFloat(d[2]),
//           low: parseFloat(d[3]),
//           close: parseFloat(d[4]),
//           volume: parseFloat(d[5]),
//         }));
//         candlesRef.current = hist;

//         candleSeriesRef.current.setData(hist);
//         volumeSeriesRef.current.setData(
//           hist.map((d) => ({
//             time: d.time,
//             value: d.volume,
//             color:
//               d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
//           }))
//         );

//         const closes = hist.map((d) => d.close);
//         const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST);
//         const emaSlow = calculateEMA(closes, STRATEGY.EMA_SLOW);
//         emaFastSeriesRef.current.setData(
//           hist
//             .map((d, i) => ({ time: d.time, value: emaFast[i] }))
//             .filter((d) => d.value != null)
//         );
//         emaSlowSeriesRef.current.setData(
//           hist
//             .map((d, i) => ({ time: d.time, value: emaSlow[i] }))
//             .filter((d) => d.value != null)
//         );

//         updateSupportResistance(candleSeriesRef.current, hist);
//         setChartReady(true);
//         setConnectionStatus("ONLINE");

//         const last = hist[hist.length - 1].time;
//         chart.timeScale().setVisibleRange({
//           from: last - CONFIG.DEFAULT_ZOOM_HOURS * 3600,
//           to: last + 600,
//         });

//         ws = new WebSocket(
//           "wss://stream.binance.com:9443/ws/paxgusdt@kline_1m"
//         );
//         ws.onmessage = (e) => {
//           const k = JSON.parse(e.data).k;
//           const candle = {
//             time: k.t / 1000,
//             open: parseFloat(k.o),
//             high: parseFloat(k.h),
//             low: parseFloat(k.l),
//             close: parseFloat(k.c),
//             volume: parseFloat(k.v),
//             isFinal: k.x,
//           };

//           candleSeriesRef.current.update(candle);
//           volumeSeriesRef.current.update({
//             time: candle.time,
//             value: candle.volume,
//             color:
//               candle.close >= candle.open
//                 ? "rgba(34,197,94,0.5)"
//                 : "rgba(239,68,68,0.5)",
//           });

//           const ch = candlesRef.current.slice();
//           if (ch[ch.length - 1]?.time === candle.time)
//             ch[ch.length - 1] = candle;
//           else ch.push(candle);
//           candlesRef.current = ch;

//           const closesLive = ch.map((c) => c.close);
//           const emaFastArr = calculateEMA(closesLive, STRATEGY.EMA_FAST);
//           const emaSlowArr = calculateEMA(closesLive, STRATEGY.EMA_SLOW);
//           const curEmaFast = emaFastArr[emaFastArr.length - 1];
//           const curEmaSlow = emaSlowArr[emaSlowArr.length - 1];

//           if (curEmaFast)
//             emaFastSeriesRef.current.update({
//               time: candle.time,
//               value: curEmaFast,
//             });
//           if (curEmaSlow)
//             emaSlowSeriesRef.current.update({
//               time: candle.time,
//               value: curEmaSlow,
//             });

//           const sr = updateSupportResistance(candleSeriesRef.current, ch);
//           const rsi = calculateRSI(closesLive);
//           const atr = calculateATR(
//             ch.map((c) => c.high),
//             ch.map((c) => c.low),
//             closesLive
//           );
//           const volSMA = calculateSMA(
//             ch.map((c) => c.volume),
//             STRATEGY.VOL_MA_PERIOD
//           );
//           const volFactor = (candle.volume / (volSMA || 1)).toFixed(2);

//           setMarketData({
//             price: candle.close,
//             rsi: rsi.toFixed(1),
//             adx: 0,
//             volFactor,
//             emaFast: curEmaFast?.toFixed(2) || 0,
//             emaSlow: curEmaSlow?.toFixed(2) || 0,
//             support: sr?.low,
//             resistance: sr?.high,
//           });

//           // smart scroll
//           const ts = chart.timeScale();
//           const logicalRange = ts.getVisibleLogicalRange();
//           if (logicalRange && candlesRef.current.length - logicalRange.to < 2) {
//             ts.scrollToRealTime();
//           }

//           // live 策略 (同之前 aggressive)
//           const isGreen = candle.close > candle.open;
//           const isAboveEma = curEmaFast && candle.close > curEmaFast;

//           const calcSize = (entry, stop) => {
//             const { size } = calcJinguoSize({
//               capital,
//               riskPct,
//               leverage,
//               entry,
//               stop,
//               hardSizeCap: 5,
//             });
//             return size.toFixed(4);
//           };

//           let tip = "監測中...",
//             setup = null;

//           if (!isAboveEma) {
//             tip = "📉 價格低於 EMA20，觀望。";
//           } else if (isGreen) {
//             tip = "🚀 金果信號！準備進場...";
//             const bodySize = Math.abs(candle.close - candle.open);
//             const entry = candle.open + bodySize * STRATEGY.RETRACE_RATIO;
//             const stop = candle.low - atr * 0.2;
//             const riskPer = entry - stop;
//             const target = entry + riskPer * STRATEGY.RISK_REWARD;

//             setup = {
//               type: "LIMIT BUY",
//               entry: entry.toFixed(2),
//               target: target.toFixed(2),
//               stop: stop.toFixed(2),
//               size: calcSize(entry, stop),
//             };

//             if (candle.isFinal && !activeSignalRef.current) {
//               const signalTime = new Date().toLocaleTimeString("en-GB", {
//                 hour: "2-digit",
//                 minute: "2-digit",
//               });
//               const sig = {
//                 type: "🚀 AGGRESSIVE BUY",
//                 price: entry,
//                 time: formatHKTime(candle.time),
//                 created: signalTime,
//                 tp: parseFloat(target.toFixed(2)),
//                 sl: parseFloat(stop.toFixed(2)),
//                 timestamp: Date.now(),
//                 entryTimeRaw: candle.time,
//               };
//               setActiveSignal(sig);
//               activeSignalRef.current = sig;
//             }
//           } else {
//             tip = "👀 等待綠K (EMA20之上)...";
//           }

//           setStrategyTip(tip);
//           setTradeSetup(setup);

//           if (activeSignalRef.current) {
//             const sig = activeSignalRef.current;
//             const elapsedMin = (Date.now() - sig.timestamp) / 60000;
//             if (candle.high >= sig.tp) {
//               recordTrade(sig, "WIN", sig.tp, candle.time);
//               setActiveSignal(null);
//               activeSignalRef.current = null;
//             } else if (candle.low <= sig.sl) {
//               recordTrade(sig, "LOSS", sig.sl, candle.time);
//               setActiveSignal(null);
//               activeSignalRef.current = null;
//             } else if (elapsedMin > 60) {
//               setActiveSignal(null);
//               activeSignalRef.current = null;
//             }
//           }
//         };
//       } catch (e) {
//         setConnectionStatus("ERR");
//         console.error(e);
//       }
//     };

//     initData();

//     const ro = new ResizeObserver((entries) => {
//       const cr = entries[0]?.contentRect;
//       if (cr && chartInstanceRef.current) {
//         chartInstanceRef.current.applyOptions({
//           width: cr.width,
//           height: cr.height,
//         });
//       }
//     });
//     ro.observe(chartContainerRef.current);

//     return () => {
//       setChartReady(false);
//       try {
//         if (ws && ws.readyState === WebSocket.OPEN) ws.close();
//       } catch {}
//       try {
//         ro.disconnect();
//       } catch {}
//       try {
//         if (chartInstanceRef.current) chartInstanceRef.current.remove();
//       } catch {}
//       chartInstanceRef.current = null;
//     };
//   }, [capital, riskPct, leverage]);
//   // ---------- UI derived data + rendering ----------

//   const rsiStat = (r) =>
//     r >= 70
//       ? { c: "#ef4444", t: "高位" }
//       : r >= 45
//       ? { c: "#4ade80", t: "健康" }
//       : { c: "#94a3b8", t: "弱勢" };
//   const rs = rsiStat(parseFloat(marketData.rsi));
//   const riskAmt = (capital * (riskPct / 100)).toFixed(0);

//   const historySource = historyMode === "live" ? liveHistory : backtestHistory;

//   const filteredHistory = historySource.filter((t) => {
//     if (!t.timestamp) return false;
//     if (filterMode === "preset") {
//       if (presetPeriod === 0) return true;
//       const elapsedMin = (Date.now() - t.timestamp) / 60000;
//       return elapsedMin >= -1 && elapsedMin <= presetPeriod;
//     }
//     return t.timestamp >= customRange.start && t.timestamp <= customRange.end;
//   });

//   const wins = filteredHistory.filter((t) => t.status === "WIN").length;
//   const losses = filteredHistory.filter((t) => t.status === "LOSS").length;
//   const winRate =
//     wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

//   const presets = [
//     { label: "1H", val: 60 },
//     { label: "4H", val: 240 },
//     { label: "24H", val: 1440 },
//     { label: "All", val: 0 },
//   ];

//   const clearHistory = async () => {
//     if (!supabase) return;
//     if (!window.confirm("清空所有 live 記錄?")) return;
//     await supabase.from("trades").delete().neq("id", 0);
//     setLiveHistory([]);
//   };

//   const isMobile = window.innerWidth < 768;
//   const styles = {
//     container: {
//       padding: isMobile ? 10 : 20,
//       background: "#09090b",
//       color: "#f4f4f5",
//       height: "100vh",
//       width: "100vw",
//       boxSizing: "border-box",
//       fontFamily: "'Roboto Mono', sans-serif",
//       display: "flex",
//       flexDirection: "column",
//       overflow: "hidden",
//     },
//     header: {
//       display: "flex",
//       alignItems: "center",
//       gap: 10,
//       marginBottom: 10,
//       borderBottom: "2px solid #27272a",
//       paddingBottom: 10,
//       flexShrink: 0,
//     },
//     statusDot: {
//       width: 10,
//       height: 10,
//       background: "#4ade80",
//       borderRadius: "50%",
//     },
//     title: {
//       fontSize: isMobile ? "1.1rem" : "1.5rem",
//       fontWeight: 700,
//       margin: 0,
//     },
//     proBadge: {
//       background: "#f59e0b",
//       color: "#000",
//       fontSize: "0.6rem",
//       padding: "2px 4px",
//       borderRadius: 4,
//       verticalAlign: "top",
//       fontWeight: "bold",
//       marginLeft: 5,
//     },
//     subtitle: { fontSize: "0.7rem", color: "#71717a", margin: "2px 0 0 0" },
//     settingsBtn: {
//       background: "#27272a",
//       color: "#fff",
//       border: "none",
//       padding: 8,
//       borderRadius: 4,
//       cursor: "pointer",
//       fontSize: "1rem",
//       fontWeight: "bold",
//     },
//     settingsPanel: {
//       background: "#18181b",
//       padding: 15,
//       borderRadius: 8,
//       marginBottom: 10,
//       border: "1px solid #3f3f46",
//     },
//     input: {
//       background: "#000",
//       border: "1px solid #3f3f46",
//       color: "#fff",
//       padding: 8,
//       borderRadius: 4,
//       marginLeft: 5,
//       width: 70,
//       fontSize: "1rem",
//     },
//     gridRow1: {
//       display: "grid",
//       gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
//       gap: 8,
//       marginBottom: 8,
//       flexShrink: 0,
//     },
//     gridRow2: {
//       display: "grid",
//       gridTemplateColumns: "1fr 1fr",
//       gap: 8,
//       marginBottom: 10,
//       flexShrink: 0,
//     },
//     backtestPanel: {
//       background: "linear-gradient(90deg,#172554 0%,#1e3a8a 100%)",
//       padding: "12px 20px",
//       borderRadius: 8,
//       marginBottom: 15,
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       border: "1px solid #3b82f6",
//       boxShadow: "0 4px 15px rgba(59,130,246,0.3)",
//       flexWrap: "wrap",
//       gap: 10,
//       flexShrink: 0,
//     },
//     btStat: { display: "flex", flexDirection: "column", alignItems: "center" },
//     btLabel: {
//       fontSize: "0.7rem",
//       color: "#93c5fd",
//       textTransform: "uppercase",
//       letterSpacing: 1,
//     },
//     btValue: { fontSize: "1.2rem", fontWeight: "bold", color: "#fff" },
//     alertBox: {
//       padding: 10,
//       borderRadius: 8,
//       marginBottom: 10,
//       fontWeight: "bold",
//       width: "100%",
//       boxSizing: "border-box",
//       flexShrink: 0,
//     },
//     tipBar: {
//       background: "#1e293b",
//       borderLeft: "4px solid #3b82f6",
//       padding: "8px 12px",
//       borderRadius: 4,
//       fontSize: "0.85rem",
//       color: "#94a3b8",
//       marginBottom: isMobile ? 5 : 0,
//       flexGrow: 1,
//       display: "flex",
//       alignItems: "center",
//     },
//     setupBox: {
//       background: "#18181b",
//       border: "1px solid #27272a",
//       borderRadius: 4,
//       padding: "8px 12px",
//       flexGrow: 1.5,
//     },
//     chartWrapper: {
//       flexGrow: 1,
//       width: "100%",
//       position: "relative",
//       background: "#000",
//       border: "1px solid #27272a",
//       borderRadius: 8,
//       overflow: "hidden",
//       minHeight: isMobile ? 300 : 400,
//     },
//     chartContainer: { width: "100%", height: "100%" },
//     closeBtn: {
//       background: "rgba(0,0,0,0.2)",
//       border: "none",
//       cursor: "pointer",
//       padding: "5px 10px",
//       borderRadius: 4,
//       fontWeight: "bold",
//       fontSize: "1.2rem",
//     },
//     historyPanel: {
//       position: "absolute",
//       top: isMobile ? 60 : 70,
//       right: isMobile ? 10 : 20,
//       bottom: isMobile ? 10 : 20,
//       width: isMobile ? "calc(100% - 20px)" : 420, // 由 320 -> 420
//       background: "#18181b",
//       border: "1px solid #3f3f46",
//       borderRadius: 8,
//       padding: 15,
//       zIndex: 100,
//       boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
//       maxHeight: "none", // 改用 bottom 控制高度
//       display: "flex",
//       flexDirection: "column",
//     },
//     filterBtn: {
//       background: "transparent",
//       color: "#71717a",
//       border: "1px solid #27272a",
//       cursor: "pointer",
//       fontSize: "0.75rem",
//       borderRadius: 4,
//       padding: "6px 10px",
//       minWidth: 40,
//     },
//     filterBtnActive: {
//       background: "#3b82f6",
//       color: "#fff",
//       border: "1px solid #3b82f6",
//       cursor: "pointer",
//       fontSize: "0.75rem",
//       borderRadius: 4,
//       padding: "6px 10px",
//       minWidth: 40,
//       fontWeight: "bold",
//     },
//     toggleBtn: {
//       background: "transparent",
//       color: "#3b82f6",
//       border: "none",
//       cursor: "pointer",
//       fontSize: "0.8rem",
//       textDecoration: "underline",
//     },
//     dateInput: {
//       background: "#000",
//       border: "1px solid #3f3f46",
//       color: "#fff",
//       padding: 8,
//       borderRadius: 4,
//       fontSize: "0.9rem",
//       width: "100%",
//       boxSizing: "border-box",
//     },
//   };

//   return (
//     <div style={styles.container}>
//       {/* Header */}
//       <div style={styles.header}>
//         <div style={styles.statusDot} />
//         <div style={{ flexGrow: 1 }}>
//           <h1 style={styles.title}>
//             JINGUO V34<span style={styles.proBadge}>LIVE+BACKTEST</span>
//           </h1>
//           <p style={styles.subtitle}>
//             PAXG/USDT • 1M • {supabase ? "DB ✓" : "DB ✗"}
//           </p>
//         </div>
//         <div
//           style={{
//             display: "flex",
//             gap: 10,
//             marginRight: 5,
//             alignItems: "center",
//           }}
//         >
//           <div
//             onClick={() => setShowHistory(!showHistory)}
//             style={{
//               cursor: "pointer",
//               background: "#27272a",
//               padding: "5px 10px",
//               borderRadius: 4,
//               border: "1px solid #3f3f46",
//               fontSize: "0.8rem",
//               color: "#fff",
//             }}
//           >
//             <span
//               style={{
//                 color: winRate >= 60 ? "#4ade80" : "#ef4444",
//                 fontWeight: "bold",
//               }}
//             >
//               {winRate}% ({wins}W)
//             </span>
//           </div>
//         </div>
//         <button
//           onClick={() => setShowSettings(!showSettings)}
//           style={styles.settingsBtn}
//         >
//           ⚙️
//         </button>
//       </div>

//       {/* Settings */}
//       {showSettings && (
//         <div style={styles.settingsPanel}>
//           <div
//             style={{
//               display: "flex",
//               gap: 15,
//               alignItems: "center",
//               flexWrap: "wrap",
//             }}
//           >
//             <label>
//               本金: $
//               <input
//                 type="number"
//                 value={capital}
//                 onChange={(e) => setCapital(Number(e.target.value))}
//                 style={styles.input}
//               />
//             </label>
//             <label>
//               Risk:
//               <input
//                 type="number"
//                 value={riskPct}
//                 onChange={(e) => setRiskPct(Number(e.target.value))}
//                 style={styles.input}
//               />
//               %
//             </label>
//             <label>
//               槓桿:
//               <input
//                 type="number"
//                 value={leverage}
//                 onChange={(e) => setLeverage(Number(e.target.value))}
//                 style={styles.input}
//               />
//               x
//             </label>
//             <button
//               onClick={runBacktest}
//               style={{
//                 background: "#3b82f6",
//                 color: "#fff",
//                 border: "none",
//                 padding: "8px 20px",
//                 borderRadius: 4,
//                 cursor: "pointer",
//                 fontWeight: "bold",
//                 fontSize: "1rem",
//               }}
//             >
//               🚀 回測
//             </button>
//             <button
//               onClick={clearHistory}
//               style={{
//                 background: "#ef4444",
//                 color: "#fff",
//                 border: "none",
//                 padding: "8px 12px",
//                 borderRadius: 4,
//                 cursor: "pointer",
//                 fontWeight: "bold",
//               }}
//             >
//               清空 live
//             </button>
//           </div>
//         </div>
//       )}

//       {/* History Panel (live / backtest tab) */}
//       {showHistory && (
//         <div style={styles.historyPanel}>
//           <div
//             style={{
//               borderBottom: "1px solid #3f3f46",
//               paddingBottom: 10,
//               marginBottom: 10,
//             }}
//           >
//             <div
//               style={{
//                 display: "flex",
//                 justifyContent: "space-between",
//                 marginBottom: 10,
//               }}
//             >
//               <strong>
//                 交易記錄 ({historyMode === "live" ? "LIVE" : "BACKTEST"}) (
//                 {historySource.length})
//               </strong>
//               <div>
//                 <button
//                   onClick={() => setHistoryMode("live")}
//                   style={
//                     historyMode === "live"
//                       ? styles.filterBtnActive
//                       : styles.filterBtn
//                   }
//                 >
//                   Live
//                 </button>
//                 <button
//                   onClick={() => setHistoryMode("backtest")}
//                   style={
//                     historyMode === "backtest"
//                       ? styles.filterBtnActive
//                       : styles.filterBtn
//                   }
//                 >
//                   Backtest
//                 </button>
//                 <button
//                   onClick={() => {
//                     const res = runSupabaseBacktest(capital, riskPct);
//                     if (res) {
//                       setSupabaseBtResult(res);
//                     }
//                   }}
//                   style={styles.filterBtn}
//                 >
//                   Supabase Backtest
//                 </button>
//               </div>
//             </div>

//             <button
//               onClick={() =>
//                 setFilterMode(filterMode === "preset" ? "custom" : "preset")
//               }
//               style={styles.toggleBtn}
//             >
//               {filterMode === "preset" ? "自定義時間" : "預設時間段"}
//             </button>

//             {filterMode === "preset" ? (
//               <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
//                 {presets.map((p) => (
//                   <button
//                     key={p.label}
//                     onClick={() => setPresetPeriod(p.val)}
//                     style={
//                       presetPeriod === p.val
//                         ? styles.filterBtnActive
//                         : styles.filterBtn
//                     }
//                   >
//                     {p.label}
//                   </button>
//                 ))}
//               </div>
//             ) : (
//               <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
//                 <input
//                   type="datetime-local"
//                   style={styles.dateInput}
//                   value={toInputFormat(customRange.start)}
//                   onChange={(e) =>
//                     setCustomRange({
//                       ...customRange,
//                       start: new Date(e.target.value).getTime(),
//                     })
//                   }
//                 />
//                 <input
//                   type="datetime-local"
//                   style={styles.dateInput}
//                   value={toInputFormat(customRange.end)}
//                   onChange={(e) =>
//                     setCustomRange({
//                       ...customRange,
//                       end: new Date(e.target.value).getTime(),
//                     })
//                   }
//                 />
//               </div>
//             )}
//           </div>

//           <div style={{ flex: 1, overflowY: "auto" }}>
//             {filteredHistory.map((t, i) => (
//               <div
//                 key={i}
//                 style={{
//                   display: "flex",
//                   justifyContent: "space-between",
//                   fontSize: "0.9rem",
//                   padding: "10px 0",
//                   borderBottom: "1px solid #27272a",
//                 }}
//               >
//                 {/* 左邊：status + time + (backtest 額外資訊) */}
//                 <div>
//                   <span
//                     style={{
//                       color: t.status === "WIN" ? "#4ade80" : "#ef4444",
//                       fontWeight: "bold",
//                       marginRight: 10,
//                     }}
//                   >
//                     {t.status}
//                   </span>
//                   <span style={{ color: "#94a3b8" }}>{t.time}</span>

//                   {historyMode === "backtest" && (
//                     <div
//                       style={{
//                         color: "#9ca3af",
//                         fontSize: "0.75rem",
//                         marginTop: 2,
//                       }}
//                     >
//                       Size: {t.size} · PnL:{" "}
//                       <span
//                         style={{
//                           color:
//                             parseFloat(t.profit) >= 0 ? "#4ade80" : "#ef4444",
//                           fontWeight: "bold",
//                         }}
//                       >
//                         {parseFloat(t.profit) >= 0 ? "+" : ""}
//                         {t.profit}
//                       </span>{" "}
//                       · Bal: ${t.balanceAfter}
//                     </div>
//                   )}
//                   {supabaseBtResult && (
//                     <div
//                       style={{
//                         marginTop: 10,
//                         fontSize: "0.8rem",
//                         color: "#e5e7eb",
//                       }}
//                     >
//                       <div>
//                         Supabase Backtest – Trades:{" "}
//                         {supabaseBtResult.totalTrades}, Win%:{" "}
//                         {supabaseBtResult.winRate}%, PnL: $
//                         {supabaseBtResult.pnl}
//                       </div>
//                       <div style={{ color: "#9ca3af" }}>
//                         AvgWin: {supabaseBtResult.avgWin}, AvgLoss:{" "}
//                         {supabaseBtResult.avgLoss}, Expectancy/trade:{" "}
//                         {supabaseBtResult.expectancy}
//                       </div>
//                     </div>
//                   )}
//                 </div>

//                 {/* 右邊：入場 / 出場價，共用 */}
//                 <div style={{ textAlign: "right" }}>
//                   <div style={{ color: "#fff" }}>In: {t.price}</div>
//                   {t.exitPrice && (
//                     <div style={{ color: "#71717a", fontSize: "0.8rem" }}>
//                       Out: {t.exitPrice}
//                     </div>
//                   )}
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       <div style={styles.gridRow1}>
//         <StatCard
//           label="現價"
//           value={marketData.price.toFixed(2)}
//           unit="$"
//           color="#FFFFFF"
//           isMain
//         />
//         <StatCard
//           label="RSI"
//           value={marketData.rsi || 0}
//           color={rs.c}
//           sub={rs.t}
//         />
//         <StatCard
//           label="EMA(20)"
//           value={marketData.emaFast || 0}
//           unit="$"
//           color="#fbbf24"
//           sub={
//             parseFloat(marketData.emaFast) > parseFloat(marketData.emaSlow)
//               ? "Bull"
//               : "Bear"
//           }
//         />
//         <StatCard
//           label="Volume x"
//           value={marketData.volFactor}
//           color="#eab308"
//           sub="VOL/AVG"
//         />
//       </div>
//       <div style={styles.gridRow2}>
//         <StatCard
//           label="支撐 (S)"
//           value={marketData.support?.toFixed(2) || "---"}
//           unit="$"
//           color="#22c55e"
//           sub="Sup"
//         />
//         <StatCard
//           label="阻力 (R)"
//           value={marketData.resistance?.toFixed(2) || "---"}
//           unit="$"
//           color="#ef4444"
//           sub="Res"
//         />
//       </div>

//       {backtestResult && (
//         <div style={styles.backtestPanel}>
//           <div
//             style={{
//               display: "flex",
//               alignItems: "center",
//               gap: 15,
//               flexGrow: 1,
//               flexWrap: "wrap",
//               justifyContent: "space-around",
//             }}
//           >
//             <div style={styles.btStat}>
//               <span style={styles.btLabel}>PERIOD</span>
//               <span style={styles.btValue}>{backtestResult.period}h</span>
//             </div>
//             <div style={styles.btStat}>
//               <span style={styles.btLabel}>TRADES</span>
//               <span style={styles.btValue}>{backtestResult.totalTrades}</span>
//             </div>
//             <div style={styles.btStat}>
//               <span style={styles.btLabel}>WIN%</span>
//               <span
//                 style={{
//                   ...styles.btValue,
//                   color: backtestResult.winRate > 50 ? "#4ade80" : "#ef4444",
//                 }}
//               >
//                 {backtestResult.winRate}%
//               </span>
//             </div>
//             <div style={styles.btStat}>
//               <span style={styles.btLabel}>PNL</span>
//               <span
//                 style={{
//                   ...styles.btValue,
//                   color:
//                     parseFloat(backtestResult.pnl) > 0 ? "#4ade80" : "#ef4444",
//                 }}
//               >
//                 ${backtestResult.pnl}
//               </span>
//             </div>
//           </div>
//           <button
//             onClick={() => {
//               setBacktestResult(null); // 只收起 summary，不清 history
//               setHistoryMode("live"); // 切返 live
//             }}
//             style={{
//               ...styles.closeBtn,
//               background: "rgba(255,255,255,0.1)",
//               color: "#fff",
//             }}
//           >
//             ✕
//           </button>
//         </div>
//       )}

//       {activeSignal && (
//         <div style={{ ...styles.alertBox, background: "#4ade80" }}>
//           <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
//             <span style={{ fontSize: "1.5rem" }}>🚀</span>
//             <div style={{ flexGrow: 1 }}>
//               <div
//                 style={{
//                   display: "flex",
//                   justifyContent: "space-between",
//                   alignItems: "center",
//                 }}
//               >
//                 <strong style={{ fontSize: "1.1rem", color: "#000" }}>
//                   SIGNAL: {activeSignal.price}
//                 </strong>
//                 <button
//                   onClick={() => {
//                     setActiveSignal(null);
//                     activeSignalRef.current = null;
//                   }}
//                   style={styles.closeBtn}
//                 >
//                   ✕
//                 </button>
//               </div>
//               <div
//                 style={{ fontSize: "0.8rem", color: "#000", marginBottom: 5 }}
//               >
//                 Created: {activeSignal.created}
//               </div>
//               <div
//                 style={{
//                   marginTop: 5,
//                   paddingTop: 5,
//                   borderTop: "1px solid rgba(0,0,0,0.1)",
//                   display: "flex",
//                   gap: 15,
//                   fontSize: "0.95rem",
//                   color: "#000",
//                   fontWeight: "bold",
//                 }}
//               >
//                 <span>🎯 {activeSignal.tp}</span>
//                 <span>🛑 {activeSignal.sl}</span>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       <div
//         style={{
//           display: "flex",
//           gap: 10,
//           marginBottom: 10,
//           alignItems: "stretch",
//           flexDirection: isMobile ? "column" : "row",
//         }}
//       >
//         <div style={styles.tipBar}>
//           <span>💡 教練:</span>
//           <span style={{ color: "#fff", fontWeight: "bold", marginLeft: 5 }}>
//             {strategyTip}
//           </span>
//         </div>
//         {tradeSetup && (
//           <div style={styles.setupBox}>
//             <div
//               style={{
//                 fontSize: "0.7rem",
//                 color: "#94a3b8",
//                 marginBottom: 5,
//                 display: "flex",
//                 justifyContent: "space-between",
//               }}
//             >
//               <span>建議部署</span>
//               <span style={{ color: "#ef4444" }}>Risk: ${riskAmt}</span>
//             </div>
//             <div
//               style={{
//                 display: "flex",
//                 gap: 15,
//                 fontSize: "0.9rem",
//                 fontWeight: "bold",
//                 alignItems: "center",
//               }}
//             >
//               <span
//                 style={{
//                   color: "#fff",
//                   background: "#27272a",
//                   padding: "2px 6px",
//                   borderRadius: 4,
//                 }}
//               >
//                 掛 {tradeSetup.size}
//               </span>
//               <span style={{ color: "#3b82f6" }}>@ {tradeSetup.entry}</span>
//               <span style={{ color: "#ef4444" }}>🛑 {tradeSetup.stop}</span>
//             </div>
//           </div>
//         )}
//       </div>

//       <div style={styles.chartWrapper}>
//         <div ref={chartContainerRef} style={styles.chartContainer} />
//       </div>
//     </div>
//   );
// }
