// src/hooks/useBacktest.js
import { useState } from "react";
import { CONFIG, STRATEGY } from "../config";
import {
  calculateEMA,
  calculateATR,
  calcJinguoSize,
} from "../utils/indicators"; // 確保你有這些 utils
import { formatHKTime } from "../utils/formatters"; // 確保你有這個 util

export const useBacktest = () => {
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestHistory, setBacktestHistory] = useState([]);
  const [supabaseBtResult, setSupabaseBtResult] = useState(null);

  // Helper: 根據時間過濾 K 線
  const filterCandlesByPeriod = (candles, periodHours) => {
    if (!candles || candles.length === 0) return [];
    if (!periodHours || periodHours <= 0) return candles;

    const lastTime = candles[candles.length - 1].time;
    const fromTime = lastTime - periodHours * 3600;
    return candles.filter((c) => c.time >= fromTime);
  };

  /**
   * 1. 本地回測邏輯 (Local Backtest)
   * 基於當前 Chart 的 K 線數據進行模擬交易
   */
  const runLocalBacktest = (allCandles, capital, riskPct, leverage) => {
    if (!allCandles || allCandles.length < 100) return;

    // 篩選數據
    const usedCandles = filterCandlesByPeriod(
      allCandles,
      CONFIG.BACKTEST_PERIOD_HOURS || 0
    );
    if (!usedCandles || usedCandles.length < 100) return;

    let balance = capital;
    let trades = [];
    let pendingOrder = null;
    let activeTrade = null;
    // let equityPoints = [{ time: usedCandles[0].time, balance }]; // 暫時沒用到，可保留擴充

    // 模擬 Loop
    for (let i = 50; i < usedCandles.length; i++) {
      const candle = usedCandles[i];
      const h = usedCandles.slice(0, i + 1);
      const closes = h.map((c) => c.close);
      const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST).pop();

      // A. 管理持倉 (Check TP/SL)
      if (activeTrade) {
        let closed = false;

        // Check TP
        if (candle.high >= activeTrade.tp) {
          const exit = Math.max(activeTrade.tp, candle.high);
          const profit = activeTrade.size * (exit - activeTrade.entry);
          balance += profit;

          trades.push({
            ...activeTrade,
            exitPrice: exit,
            status: "WIN",
            exitTime: candle.time,
            profit,
            balanceAfter: balance,
          });
          activeTrade = null;
          closed = true;
        }
        // Check SL
        else if (candle.low <= activeTrade.sl) {
          const exit = Math.min(activeTrade.sl, candle.low);
          const profit = activeTrade.size * (exit - activeTrade.entry);
          balance += profit;

          trades.push({
            ...activeTrade,
            exitPrice: exit,
            status: "LOSS",
            exitTime: candle.time,
            profit,
            balanceAfter: balance,
          });
          activeTrade = null;
          closed = true;
        }

        if (closed) continue;
      }

      // B. 管理掛單 (Pending Order)
      if (pendingOrder) {
        if (candle.low <= pendingOrder.entry) {
          activeTrade = pendingOrder;
          pendingOrder = null;
        } else if (candle.time - pendingOrder.timestamp / 1000 > 3600) {
          // 超時取消
          pendingOrder = null;
        }
        continue;
      }

      // C. 尋找新信號 (Entry Logic)
      const isGreen = candle.close > candle.open;
      const isAboveEma = candle.close > emaFast;

      if (!isGreen || !isAboveEma) continue;

      const atr = calculateATR(
        h.map((c) => c.high),
        h.map((c) => c.low),
        closes
      );
      const bodySize = Math.abs(candle.close - candle.open);
      const entry = candle.open + bodySize * STRATEGY.RETRACE_RATIO;
      const stop = candle.low - atr * 0.2;
      const risk = Math.abs(entry - stop);

      if (!risk || !Number.isFinite(risk)) continue;

      const target = entry + risk * STRATEGY.RISK_REWARD;

      // 計算倉位 (Jinguo Size)
      const { size } = calcJinguoSize({
        capital: balance,
        riskPct,
        leverage,
        entry,
        stop,
        hardSizeCap: 5,
      });

      if (!size || size <= 0) continue;

      pendingOrder = {
        entry,
        sl: stop,
        tp: target,
        size,
        timestamp: candle.time * 1000,
        type: "BUY",
      };
    }

    // 統計結果
    const wins = trades.filter((t) => t.status === "WIN");
    const losses = trades.filter((t) => t.status === "LOSS");
    const total = wins.length + losses.length;
    const winRate =
      total > 0 ? ((wins.length / total) * 100).toFixed(1) : "0.0";

    const sumWin = wins.reduce(
      (s, t) => s + t.size * (t.exitPrice - t.entry),
      0
    );
    const sumLoss = losses.reduce(
      (s, t) => s + t.size * (t.exitPrice - t.entry),
      0
    );

    const avgWin = wins.length ? sumWin / wins.length : 0;
    const avgLoss = losses.length ? sumLoss / losses.length : 0;
    const pnl = balance - capital;
    const pnlPct = capital > 0 ? ((pnl / capital) * 100).toFixed(1) : "0.0";

    const periodSeconds =
      usedCandles[usedCandles.length - 1].time - usedCandles[0].time;
    const periodHrsReal = (periodSeconds / 3600).toFixed(1);
    const p = total > 0 ? wins.length / total : 0;
    const expectancy = p * avgWin + (1 - p) * avgLoss;

    // 設定 Result State
    setBacktestResult({
      totalTrades: total,
      wins: wins.length,
      losses: losses.length,
      winRate,
      pnl: pnl.toFixed(2),
      pnlPct,
      finalBalance: balance.toFixed(2),
      period: periodHrsReal,
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      expectancy: expectancy.toFixed(2),
    });

    // 格式化歷史列表供 UI 顯示
    const simHistory = trades
      .slice()
      .reverse()
      .map((d) => ({
        status: d.status,
        price: d.entry.toFixed(2),
        exitPrice: d.exitPrice.toFixed(2),
        size: d.size.toFixed(3),
        profit: d.profit.toFixed(2),
        balanceAfter: d.balanceAfter.toFixed(2),
        exitTime: formatHKTime(d.exitTime),
        time: formatHKTime(d.timestamp / 1000),
        entryTimeRaw: d.timestamp / 1000,
        timestamp: d.timestamp,
      }));

    setBacktestHistory(simHistory);
  };

  /**
   * 2. Supabase 歷史訂單回測 (Supabase Backtest)
   * 重跑真實記錄的 PnL
   */
  const runSupabaseBacktest = (liveHistory, initialCapital, riskPct) => {
    console.log("Starting Supabase Backtest...", {
      liveHistory,
      initialCapital,
      riskPct,
    }); // Debug Log

    if (!liveHistory || liveHistory.length === 0) {
      console.warn("No history data found for Supabase backtest");
      return null;
    }

    // 按 entryTimeRaw 由舊到新排序，並過濾掉未完成的交易
    const trades = [...liveHistory]
      .filter((t) => {
        // 確保有進場價和出場價，且不是 "-" 或 null
        const hasEntry = t.price && !isNaN(parseFloat(t.price));
        const hasExit = t.exitPrice && !isNaN(parseFloat(t.exitPrice));
        return hasEntry && hasExit;
      })
      .sort((a, b) => a.entryTimeRaw - b.entryTimeRaw);

    if (trades.length === 0) {
      console.warn("No valid closed trades found");
      return null;
    }

    let balance = parseFloat(initialCapital);
    let equity = [{ time: trades[0].entryTimeRaw, balance }];
    let winCount = 0;
    let lossCount = 0;
    let sumWin = 0;
    let sumLoss = 0;

    trades.forEach((t) => {
      const entry = parseFloat(t.price);
      const exit = parseFloat(t.exitPrice);

      // 計算倉位大小 (模擬當時的 Risk Setting)
      const riskAmt = balance * (riskPct / 100);

      // 注意：這裡假設一個標準止損距離 (例如 0.3%)，因為 DB 可能沒存當時的 SL
      // 如果你的 DB 有存 sl 欄位，應該用 Math.abs(entry - t.sl)
      const estimatedRiskPerUnit = entry * 0.003;
      const size = riskAmt / (estimatedRiskPerUnit || 1);

      const profit = size * (exit - entry);
      balance += profit;

      // 判斷勝負 (有些單可能微賺微蝕)
      const isWin = profit >= 0;

      if (isWin) {
        winCount++;
        sumWin += profit;
      } else {
        lossCount++;
        sumLoss += profit;
      }

      equity.push({ time: t.entryTimeRaw, balance });
    });

    const total = winCount + lossCount;
    const winRate = total > 0 ? ((winCount / total) * 100).toFixed(1) : "0.0";
    const avgWin = winCount ? sumWin / winCount : 0;
    const avgLoss = lossCount ? sumLoss / lossCount : 0;

    // Expectancy = (Win% * AvgWin) + (Loss% * AvgLoss)
    const p = total > 0 ? winCount / total : 0;
    const expectancy = p * avgWin + (1 - p) * avgLoss;

    const result = {
      totalTrades: total,
      wins: winCount,
      losses: lossCount,
      winRate,
      pnl: (balance - initialCapital).toFixed(2),
      finalBalance: balance.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      expectancy: expectancy.toFixed(2),
      equity,
    };

    console.log("Supabase Backtest Result:", result); // Debug Log
    setSupabaseBtResult(result);
    return result;
  };

  return {
    backtestResult,
    setBacktestResult,
    backtestHistory,
    setBacktestHistory,
    supabaseBtResult,
    setSupabaseBtResult,
    runLocalBacktest,
    runSupabaseBacktest,
  };
};
