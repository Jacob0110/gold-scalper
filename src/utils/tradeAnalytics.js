// src/utils/tradeAnalytics.js

export const calculateTradeMetrics = (trades) => {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: "0%",
      profitFactor: "0.00",
      totalNetPnL: "$0.00",
      totalRawPnL: "$0.00",
      totalCosts: "$0.00",
      avgWin: "$0.00",
      avgLoss: "$0.00",
      payoffRatio: "0.00",
      expectedValuePerTrade: "$0.00",
      maxConsecutiveLosses: 0,
      maxDrawdown: "$0.00",
      maxDrawdownPercent: "0%",
      sharpeRatio: "0.00",
      winLossRatio: "0.00",
    };
  }

  // Filter trades with valid net PnL
  const validTrades = trades
    .filter((t) => t.netPnL !== undefined && t.netPnL !== null)
    .map((t) => ({
      ...t,
      netPnLNum: parseFloat(t.netPnL),
      rawPnLNum: parseFloat(t.rawPnL || 0),
      costNum: parseFloat(t.totalCost || 0),
    }));

  if (validTrades.length === 0) {
    return {
      totalTrades: trades.length,
      winTrades: 0,
      lossTrades: 0,
      winRate: "0%",
      profitFactor: "0.00",
      totalNetPnL: "$0.00",
      totalRawPnL: "$0.00",
      totalCosts: "$0.00",
      avgWin: "$0.00",
      avgLoss: "$0.00",
      payoffRatio: "0.00",
      expectedValuePerTrade: "$0.00",
      maxConsecutiveLosses: 0,
      maxDrawdown: "$0.00",
      maxDrawdownPercent: "0%",
      sharpeRatio: "0.00",
      winLossRatio: "0.00",
    };
  }

  // ✅ Win/Loss Trades
  const winTrades = validTrades.filter((t) => t.netPnLNum > 0);
  const lossTrades = validTrades.filter((t) => t.netPnLNum <= 0);

  // ✅ Total PnL
  const totalNetPnL = validTrades.reduce((sum, t) => sum + t.netPnLNum, 0);
  const totalRawPnL = validTrades.reduce((sum, t) => sum + t.rawPnLNum, 0);
  const totalCosts = validTrades.reduce((sum, t) => sum + t.costNum, 0);

  const totalWin = winTrades.reduce((sum, t) => sum + t.netPnLNum, 0);
  const totalLoss = lossTrades.reduce((sum, t) => sum + t.netPnLNum, 0);

  // ✅ Win Rate
  const winRate = ((winTrades.length / validTrades.length) * 100).toFixed(1);

  // ✅ Profit Factor (最重要！)
  const profitFactor =
    Math.abs(totalLoss) > 0
      ? (totalWin / Math.abs(totalLoss)).toFixed(2)
      : totalWin > 0
      ? "∞"
      : "0.00";

  // ✅ Average Win & Loss
  const avgWin =
    winTrades.length > 0 ? (totalWin / winTrades.length).toFixed(2) : "0.00";
  const avgLoss =
    lossTrades.length > 0 ? (totalLoss / lossTrades.length).toFixed(2) : "0.00";

  // ✅ Payoff Ratio (Avg Win / Abs(Avg Loss))
  const payoffRatio =
    Math.abs(parseFloat(avgLoss)) > 0
      ? (Math.abs(parseFloat(avgWin)) / Math.abs(parseFloat(avgLoss))).toFixed(
          2
        )
      : "N/A";

  // ✅ Expected Value Per Trade
  const expectedValue = (totalNetPnL / validTrades.length).toFixed(2);

  // ✅ Max Consecutive Losses
  const maxConsecLosses = calculateMaxConsecutiveLosses(validTrades);

  // ✅ Max Drawdown
  const { maxDD, maxDDPercent } = calculateMaxDrawdown(validTrades);

  // ✅ Sharpe Ratio (if multiple trades)
  const sharpeRatio =
    validTrades.length > 1
      ? calculateSharpeRatio(
          validTrades.map((t) => t.netPnLNum),
          parseFloat(expectedValue)
        )
      : "0.00";

  // ✅ Win/Loss Ratio
  const winLossRatio =
    lossTrades.length > 0
      ? (winTrades.length / lossTrades.length).toFixed(2)
      : winTrades.length > 0
      ? "∞"
      : "0.00";

  return {
    totalTrades: validTrades.length,
    winTrades: winTrades.length,
    lossTrades: lossTrades.length,
    winRate: `${winRate}%`,

    totalNetPnL: `$${totalNetPnL.toFixed(2)}`,
    totalRawPnL: `$${totalRawPnL.toFixed(2)}`,
    totalCosts: `$${totalCosts.toFixed(2)}`,

    profitFactor,
    payoffRatio,
    avgWin: `$${avgWin}`,
    avgLoss: `$${avgLoss}`,

    expectedValuePerTrade: `$${expectedValue}`,
    maxConsecutiveLosses: maxConsecLosses,
    maxDrawdown: `$${maxDD.toFixed(2)}`,
    maxDrawdownPercent: `${maxDDPercent.toFixed(1)}%`,

    sharpeRatio,
    winLossRatio,

    // 原始數值（用於 UI 顏色判斷）
    _totalNetPnLNum: totalNetPnL,
    _profitFactorNum: profitFactor === "∞" ? 999 : parseFloat(profitFactor),
    _winRateNum: parseFloat(winRate),
  };
};

/**
 * ✅ Calculate Max Consecutive Losses
 */
const calculateMaxConsecutiveLosses = (trades) => {
  let maxConsec = 0;
  let currentConsec = 0;

  trades.forEach((t) => {
    if (t.netPnLNum <= 0) {
      currentConsec++;
      maxConsec = Math.max(maxConsec, currentConsec);
    } else {
      currentConsec = 0;
    }
  });

  return maxConsec;
};

/**
 * ✅ Calculate Max Drawdown (both absolute and percentage)
 */
const calculateMaxDrawdown = (trades) => {
  let peak = 0;
  let maxDD = 0;
  let peakPercent = 0;
  let maxDDPercent = 0;
  let cumPnL = 0;
  let initialCapital = 1000; // 假設初始資金 $1000

  trades.forEach((t, idx) => {
    cumPnL += t.netPnLNum;

    // Absolute Drawdown
    if (cumPnL > peak) peak = cumPnL;
    const drawdown = peak - cumPnL;
    maxDD = Math.max(maxDD, drawdown);

    // Percentage Drawdown
    const currentBalance = initialCapital + cumPnL;
    const peakBalance = initialCapital + peak;

    if (peakBalance > 0) {
      const ddPercent = ((peakBalance - currentBalance) / peakBalance) * 100;
      if (currentBalance < peakBalance) {
        maxDDPercent = Math.max(maxDDPercent, ddPercent);
      }
    }
  });

  return { maxDD, maxDDPercent };
};

/**
 * ✅ Calculate Sharpe Ratio
 * Sharpe = (Mean Return - Risk-Free Rate) / Std Dev
 * Assuming risk-free rate = 0 for crypto/day trading
 */
const calculateSharpeRatio = (returns, expectedValue) => {
  if (returns.length < 2) return "0.00";

  const mean = expectedValue;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
    returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return "0.00";

  // Sharpe Ratio (annualized, assuming 252 trading days)
  const sharpe = (mean / stdDev) * Math.sqrt(252);

  return sharpe.toFixed(2);
};

/**
 * ✅ Recovery Factor
 * = Gross Profit / Max Drawdown
 */
export const calculateRecoveryFactor = (metrics) => {
  const grossProfit = parseFloat(metrics.totalNetPnL);
  const maxDD = parseFloat(metrics.maxDrawdown);

  if (maxDD === 0) return "N/A";
  return (grossProfit / maxDD).toFixed(2);
};

/**
 * ✅ Risk-Reward Summary for quick validation
 */
export const getMetricsSummary = (metrics) => {
  const profitFactor = parseFloat(metrics.profitFactor) || 0;
  const winRate = parseFloat(metrics.winRate) || 0;
  const totalPnL = parseFloat(metrics.totalNetPnL) || 0;
  const maxDD = parseFloat(metrics.maxDrawdown) || 0;

  let verdict = "🔴 Poor";

  // 評估邏輯
  if (profitFactor > 2.0 && winRate > 55 && totalPnL > 0) {
    verdict = "🟢 Excellent";
  } else if (profitFactor > 1.5 && winRate > 50 && totalPnL > 0) {
    verdict = "🟡 Good";
  } else if (profitFactor > 1.0 && winRate > 45 && totalPnL > 0) {
    verdict = "🟠 Fair";
  } else if (totalPnL <= 0) {
    verdict = "🔴 Unprofitable";
  }

  return {
    verdict,
    profitFactor: profitFactor > 0 ? profitFactor : 0,
    sustainability:
      maxDD > 0 ? (totalPnL / maxDD).toFixed(2) : totalPnL > 0 ? "∞" : "0",
  };
};
