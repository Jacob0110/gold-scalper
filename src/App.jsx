import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";

// Configs & Utils
import { CONFIG, STRATEGY } from "./config";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateATR,
  calcJinguoSize,
} from "./utils/indicators";
import { formatHKTime } from "./utils/formatters";

// Hooks
import { useSupabaseTrades } from "./hooks/useSupabaseTrades";
import { useBacktest } from "./hooks/useBacktest";

// Components
import StatCard from "./components/StatCard";
import HistoryPanel from "./components/HistoryPanel";
import SettingsPanel from "./components/SettingsPanel";

// Styles
import "./App.css";

export default function App() {
  // ---------- A. 狀態與 Refs ----------
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const emaFastSeriesRef = useRef(null);
  const emaSlowSeriesRef = useRef(null);
  const supportLineRef = useRef(null);
  const resistanceLineRef = useRef(null);
  const activeSignalRef = useRef(null);

  const candlesRef = useRef([]);

  // UI State
  const [marketData, setMarketData] = useState({
    price: 0,
    rsi: 0,
    adx: 0,
    volFactor: "0.00",
    emaFast: 0,
    emaSlow: 0,
    support: 0,
    resistance: 0,
  });
  const [activeSignal, setActiveSignal] = useState(null);
  const [strategyTip, setStrategyTip] = useState("初始化...");
  const [tradeSetup, setTradeSetup] = useState(null);
  const [chartReady, setChartReady] = useState(false);

  // UI Toggle
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMode, setHistoryMode] = useState("live");

  // Settings
  const [capital, setCapital] = useState(1000);
  const [riskPct, setRiskPct] = useState(2);
  const [leverage, setLeverage] = useState(1);

  // Refs for stable dependency (解決 useEffect 重跑問題)
  const capitalRef = useRef(capital);
  const riskPctRef = useRef(riskPct);
  const leverageRef = useRef(leverage);

  useEffect(() => {
    capitalRef.current = capital;
  }, [capital]);
  useEffect(() => {
    riskPctRef.current = riskPct;
  }, [riskPct]);
  useEffect(() => {
    leverageRef.current = leverage;
  }, [leverage]);

  // ---------- Notification Helpers ----------
  const playAlertSound = () => {
    try {
      // 使用更穩定的音效連結
      const audio = new Audio(
        "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
      );
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Audio blocked (User interaction needed):", error);
        });
      }
    } catch (e) {
      console.error("Audio system error:", e);
    }
  };

  const sendSystemNotification = (title, body) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/vite.svg" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body, icon: "/vite.svg" });
        }
      });
    }
  };

  // Hooks
  const { liveHistory, recordTrade, clearHistory, supabase } =
    useSupabaseTrades();
  const {
    backtestResult,
    setBacktestResult,
    backtestHistory,
    supabaseBtResult,
    setSupabaseBtResult,
    runLocalBacktest,
    runSupabaseBacktest,
  } = useBacktest();

  // Helper: S/R Lines
  const updateSupportResistance = (series, candles) => {
    if (!series || candles.length < STRATEGY.LOOKBACK_PERIOD) return;
    const recent = candles.slice(-STRATEGY.LOOKBACK_PERIOD);
    const low = Math.min(...recent.map((c) => c.low));
    const high = Math.max(...recent.map((c) => c.high));

    if (supportLineRef.current) series.removePriceLine(supportLineRef.current);
    if (resistanceLineRef.current)
      series.removePriceLine(resistanceLineRef.current);

    resistanceLineRef.current = series.createPriceLine({
      price: high,
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "R",
    });
    supportLineRef.current = series.createPriceLine({
      price: low,
      color: "#22c55e",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "S",
    });
    return { low, high };
  };

  // ---------- Core Logic: Chart & WebSocket ----------
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#A1A1AA",
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "#18181b" },
        horzLines: { color: "#18181b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      localization: { timeFormatter: formatHKTime, dateFormat: "yyyy-MM-dd" },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#27272a",
        rightOffset: 12,
        barSpacing: 10,
      },
      rightPriceScale: {
        borderColor: "#27272a",
        scaleMargins: { top: 0.1, bottom: 0.2 },
        autoScale: true,
      },
    });
    chartInstanceRef.current = chart;

    // 2. Add Series
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "#eab308",
    });
    volumeSeriesRef.current
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    emaFastSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#fbbf24",
      lineWidth: 1,
      title: "EMA20",
    });
    emaSlowSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      lineStyle: 2,
      title: "EMA50",
    });

    let ws;

    // 3. Init Data
    const initData = async () => {
      try {
        const res = await fetch(
          "https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=1000"
        );
        const raw = await res.json();
        const hist = raw.map((d) => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
          volume: parseFloat(d[5]),
        }));
        candlesRef.current = hist;

        candleSeriesRef.current.setData(hist);
        volumeSeriesRef.current.setData(
          hist.map((d) => ({
            time: d.time,
            value: d.volume,
            color:
              d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
          }))
        );

        const closes = hist.map((d) => d.close);
        const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST);
        const emaSlow = calculateEMA(closes, STRATEGY.EMA_SLOW);

        // 🔥🔥🔥 修正: 嚴格過濾 null/NaN，解決 "Value is null" 錯誤 🔥🔥🔥
        const emaFastData = hist
          .map((d, i) => ({ time: d.time, value: emaFast[i] }))
          .filter(
            (d) => d.value !== null && d.value !== undefined && !isNaN(d.value)
          );

        const emaSlowData = hist
          .map((d, i) => ({ time: d.time, value: emaSlow[i] }))
          .filter(
            (d) => d.value !== null && d.value !== undefined && !isNaN(d.value)
          );

        emaFastSeriesRef.current.setData(emaFastData);
        emaSlowSeriesRef.current.setData(emaSlowData);

        updateSupportResistance(candleSeriesRef.current, hist);
        setChartReady(true);

        const last = hist[hist.length - 1].time;
        chart.timeScale().setVisibleRange({
          from: last - CONFIG.DEFAULT_ZOOM_HOURS * 3600,
          to: last + 600,
        });

        // WebSocket
        ws = new WebSocket(
          "wss://stream.binance.com:9443/ws/paxgusdt@kline_1m"
        );
        ws.onmessage = (e) => {
          const k = JSON.parse(e.data).k;
          const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: k.x,
          };

          candleSeriesRef.current.update(candle);
          volumeSeriesRef.current.update({
            time: candle.time,
            value: candle.volume,
            color:
              candle.close >= candle.open
                ? "rgba(34,197,94,0.5)"
                : "rgba(239,68,68,0.5)",
          });

          const ch = candlesRef.current.slice();
          if (ch[ch.length - 1]?.time === candle.time)
            ch[ch.length - 1] = candle;
          else ch.push(candle);
          candlesRef.current = ch;

          const closesLive = ch.map((c) => c.close);
          const emaFastArr = calculateEMA(closesLive, STRATEGY.EMA_FAST);
          const emaSlowArr = calculateEMA(closesLive, STRATEGY.EMA_SLOW);
          const curEmaFast = emaFastArr[emaFastArr.length - 1];
          const curEmaSlow = emaSlowArr[emaSlowArr.length - 1];

          if (curEmaFast)
            emaFastSeriesRef.current.update({
              time: candle.time,
              value: curEmaFast,
            });
          if (curEmaSlow)
            emaSlowSeriesRef.current.update({
              time: candle.time,
              value: curEmaSlow,
            });

          const sr = updateSupportResistance(candleSeriesRef.current, ch);
          const rsi = calculateRSI(closesLive);
          const atr = calculateATR(
            ch.map((c) => c.high),
            ch.map((c) => c.low),
            closesLive
          );
          const volSMA = calculateSMA(
            ch.map((c) => c.volume),
            STRATEGY.VOL_MA_PERIOD
          );
          const volFactor = (candle.volume / (volSMA || 1)).toFixed(2);

          setMarketData({
            price: candle.close,
            rsi: rsi.toFixed(1),
            adx: 0,
            volFactor,
            emaFast: curEmaFast?.toFixed(2) || 0,
            emaSlow: curEmaSlow?.toFixed(2) || 0,
            support: sr?.low,
            resistance: sr?.high,
          });

          const ts = chart.timeScale();
          const logicalRange = ts.getVisibleLogicalRange();
          if (logicalRange && candlesRef.current.length - logicalRange.to < 2) {
            ts.scrollToRealTime();
          }

          // Strategy Logic
          const isGreen = candle.close > candle.open;
          const isAboveEma = curEmaFast && candle.close > curEmaFast;

          let tip = "監測中...";
          let setup = null;

          if (!isAboveEma) {
            tip = "📉 價格低於 EMA20，觀望。";
          } else if (isGreen) {
            tip = "🚀 金果信號！準備進場...";
            const bodySize = Math.abs(candle.close - candle.open);
            const entry = candle.open + bodySize * STRATEGY.RETRACE_RATIO;
            const stop = candle.low - atr * 0.2;
            const riskPer = entry - stop;
            const target = entry + riskPer * STRATEGY.RISK_REWARD;

            // 計算 UI 用 Size
            const { size: uiSize } = calcJinguoSize({
              capital: capitalRef.current,
              riskPct: riskPctRef.current,
              leverage: leverageRef.current,
              entry,
              stop,
            });

            setup = {
              type: "LIMIT BUY",
              entry: entry.toFixed(2),
              target: target.toFixed(2),
              stop: stop.toFixed(2),
              size: uiSize.toFixed(4),
            };

            // 🚀🚀🚀 觸發交易邏輯 🚀🚀🚀
            if (candle.isFinal && !activeSignalRef.current) {
              const signalTime = new Date().toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              });

              // 計算實際交易用 Size
              const { size: tradeSize } = calcJinguoSize({
                capital: capitalRef.current,
                riskPct: riskPctRef.current,
                leverage: leverageRef.current,
                entry,
                stop,
              });

              const sig = {
                type: "🚀 AGGRESSIVE BUY",
                price: entry,
                time: formatHKTime(candle.time),
                created: signalTime,
                tp: parseFloat(target.toFixed(2)),
                sl: parseFloat(stop.toFixed(2)),
                size: tradeSize,
                timestamp: Date.now(),
                entryTimeRaw: candle.time,
              };

              // 1. 第一步：鎖定狀態 (Lock State)
              setActiveSignal(sig);
              activeSignalRef.current = sig;

              // 2. 第二步：立刻寫入數據庫 (Database First!)
              // 無論後面發生什麼事，這行必須先跑
              console.log("Attempting to record OPEN trade...");
              recordTrade(sig, "OPEN", null, candle.time);

              // 3. 第三步：才是通知 (Notification Last)
              // 並且必須用 setTimeout 將其移出主執行緒，避免阻塞
              setTimeout(() => {
                try {
                  playAlertSound();
                  sendSystemNotification(
                    "JINGUO SIGNAL 🚀",
                    `Buy @ ${entry} | TP: ${target}`
                  );
                } catch (error) {
                  console.warn(
                    "Notification failed, but trade should be safe:",
                    error
                  );
                }
              }, 0);
            }
          } else {
            tip = "👀 等待綠K (EMA20之上)...";
          }

          setStrategyTip(tip);
          setTradeSetup(setup);

          // Monitor Active Trades
          if (activeSignalRef.current) {
            const sig = activeSignalRef.current;
            const elapsedMin = (Date.now() - sig.timestamp) / 60000;
            if (candle.high >= sig.tp) {
              recordTrade(sig, "WIN", sig.tp, candle.time);
              setActiveSignal(null);
              activeSignalRef.current = null;
            } else if (candle.low <= sig.sl) {
              recordTrade(sig, "LOSS", sig.sl, candle.time);
              setActiveSignal(null);
              activeSignalRef.current = null;
            } else if (elapsedMin > 60) {
              // 超時處理，視需求可改為 Close
              setActiveSignal(null);
              activeSignalRef.current = null;
            }
          }
        };
      } catch (e) {
        console.error(e);
      }
    };

    initData();

    // Resize Observer
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: cr.width,
          height: cr.height,
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      setChartReady(false);
      try {
        if (ws) ws.close();
      } catch {}
      try {
        ro.disconnect();
      } catch {}
      try {
        if (chartInstanceRef.current) chartInstanceRef.current.remove();
      } catch {}
      chartInstanceRef.current = null;
    };
  }, [recordTrade]); // Dependency Safe

  // Markers
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current || liveHistory.length === 0)
      return;
    try {
      const markers = liveHistory
        .map((t) => ({
          time: t.entryTimeRaw,
          position: t.status === "WIN" ? "belowBar" : "aboveBar",
          color:
            t.status === "WIN"
              ? "#4ade80"
              : t.status === "LOSS"
              ? "#ef4444"
              : "#fbbf24", // OPEN 顯示黃色
          shape:
            t.status === "WIN"
              ? "arrowUp"
              : t.status === "LOSS"
              ? "arrowDown"
              : "circle",
          text: t.status,
        }))
        .sort((a, b) => a.time - b.time);
      candleSeriesRef.current.setMarkers(markers);
    } catch (e) {}
  }, [liveHistory, chartReady]);

  // Derived State
  const rsiStat = (r) =>
    r >= 70
      ? { c: "#ef4444", t: "高位" }
      : r >= 45
      ? { c: "#4ade80", t: "健康" }
      : { c: "#94a3b8", t: "弱勢" };
  const rs = rsiStat(parseFloat(marketData.rsi));
  const wins = (historyMode === "live" ? liveHistory : backtestHistory).filter(
    (t) => t.status === "WIN"
  ).length;
  const losses = (
    historyMode === "live" ? liveHistory : backtestHistory
  ).filter((t) => t.status === "LOSS").length;
  const winRate =
    wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

  return (
    <div className="app-container">
      {/* 1. Header */}
      <div className="app-header">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            JINGUO V34 PRO
          </h1>
          <div
            style={{
              color: "#71717a",
              fontSize: "0.75rem",
              fontFamily: "monospace",
            }}
          >
            PAXG/USDT • 1M • {supabase ? "SYNC" : "LOCAL"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Notification Button */}
          <button
            onClick={() => {
              Notification.requestPermission();
              playAlertSound();
              alert("通知權限已請求 & 聲音測試播放中");
            }}
            style={{
              background: "transparent",
              border: "1px solid #3f3f46",
              color: "#fff",
              padding: "6px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            🔔
          </button>

          <div
            onClick={() => setShowHistory(!showHistory)}
            style={{
              cursor: "pointer",
              background: "#18181b",
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #3f3f46",
              color: winRate >= 60 ? "#4ade80" : "#ef4444",
              fontWeight: "bold",
              fontSize: "0.85rem",
            }}
          >
            WIN: {winRate}% ({wins}W)
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: "#27272a",
              border: "none",
              color: "#fff",
              width: 32,
              height: 32,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Panels */}
      {showSettings && (
        <SettingsPanel
          capital={capital}
          setCapital={setCapital}
          riskPct={riskPct}
          setRiskPct={setRiskPct}
          leverage={leverage}
          setLeverage={setLeverage}
          clearHistory={clearHistory}
          onRunBacktest={() => {
            runLocalBacktest(candlesRef.current, capital, riskPct, leverage);
            setHistoryMode("backtest");
            setShowSettings(false);
          }}
        />
      )}

      <HistoryPanel
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        historyMode={historyMode}
        setHistoryMode={setHistoryMode}
        historySource={historyMode === "live" ? liveHistory : backtestHistory}
        runSupabaseBacktest={() => {
          if (liveHistory.length === 0) {
            alert("沒有 Live 交易記錄，無法進行 Supabase 回測");
            return;
          }
          const res = runSupabaseBacktest(liveHistory, capital, riskPct);
          setSupabaseBtResult(res);
        }}
        supabaseBtResult={supabaseBtResult}
        setBacktestResult={setBacktestResult}
      />

      {/* 2. Grid 1 */}
      <div className="stats-grid-row-1">
        <StatCard
          className="stat-card"
          label="Price"
          value={marketData.price.toFixed(2)}
          unit="$"
          color="#fff"
        />
        <StatCard
          className="stat-card"
          label="RSI"
          value={marketData.rsi}
          color={rs.c}
          sub={rs.t}
        />
        <StatCard
          className="stat-card"
          label="EMA Trend"
          value={marketData.emaFast}
          unit="$"
          color="#fbbf24"
          sub={
            parseFloat(marketData.emaFast) > parseFloat(marketData.emaSlow)
              ? "BULL"
              : "BEAR"
          }
        />
        <StatCard
          className="stat-card"
          label="Vol Factor"
          value={marketData.volFactor}
          color="#eab308"
        />
      </div>

      {/* Grid 2 */}
      <div className="stats-grid-row-2">
        <StatCard
          className="stat-card"
          label="Support"
          value={marketData.support?.toFixed(2) || "---"}
          color="#22c55e"
        />
        <StatCard
          className="stat-card"
          label="Resistance"
          value={marketData.resistance?.toFixed(2) || "---"}
          color="#ef4444"
        />
      </div>

      {/* 3. Info Section */}
      <div className="info-section">
        <div
          className="stat-card"
          style={{
            flex: 1,
            borderLeft: "4px solid #3b82f6",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ marginRight: 8 }}>🤖 AI Coach:</span>
          <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
            {strategyTip}
          </span>
        </div>
        {tradeSetup && (
          <div
            className="stat-card"
            style={{
              flex: 1,
              border: "1px dashed #3f3f46",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "#71717a" }}>SETUP</span>
            <span style={{ fontWeight: "bold", color: "#fff" }}>
              Risk: ${(capital * (riskPct / 100)).toFixed(0)} @{" "}
              {tradeSetup.entry}
            </span>
          </div>
        )}
      </div>

      {/* 4. Chart Wrapper */}
      <div className="chart-wrapper">
        <div ref={chartContainerRef} className="chart-inner" />
      </div>

      {/* Backtest Overlay */}
      {backtestResult && (
        <div
          style={{
            position: "absolute",
            top: 120,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#172554",
            padding: 20,
            borderRadius: 8,
            border: "1px solid #3b82f6",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 20,
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            <div>Trades: {backtestResult.totalTrades}</div>
            <div>Win: {backtestResult.winRate}%</div>
            <div>PnL: ${backtestResult.pnl}</div>
          </div>
          <button
            onClick={() => {
              setBacktestResult(null);
              setHistoryMode("live");
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 5,
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
