// 風險管理與倉位計算
export const calcJinguoSize = ({
  capital,
  riskPct,
  leverage,
  entry,
  stop,
  hardSizeCap = 5,
}) => {
  const riskAmt = capital * (riskPct / 100);
  const riskPerUnit = Math.abs(entry - stop) || 0.1;
  const rawSize = riskAmt / riskPerUnit;
  const maxSizeByLev = (capital * leverage) / entry;
  const size = Math.min(rawSize, maxSizeByLev, hardSizeCap);

  return {
    size: Number(size.toFixed(4)),
    riskAmt,
    riskPerUnit,
  };
};

export const calculateSMA = (data, period) => {
  if (!data || data.length === 0) return 0;
  const slice = data.slice(-Math.min(data.length, period));
  return (
    slice.reduce((a, b) => a + (parseFloat(b) || 0), 0) / slice.length || 0
  );
};

export const calculateEMA = (data, period) => {
  if (!data || data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return new Array(period - 1).fill(null).concat(ema);
};

export const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / period / (losses / period || 1);
  return 100 - 100 / (1 + rs);
};

export const calculateATR = (highs, lows, closes, period = 14) => {
  if (!highs || highs.length < period + 1) return 1;
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const look = trs.slice(-Math.min(trs.length, period));
  return look.reduce((a, b) => a + b, 0) / look.length || 1;
};
