import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';

// --- Jinguo Strategy Config ---
const STRATEGY = {
  RSI_PERIOD: 14, VOL_MA_PERIOD: 20, EMA_PERIOD: 20,
  MACD_FAST: 12, MACD_SLOW: 26, MACD_SIGNAL: 9, 
  RSI_THRESHOLD: 55, RSI_OVERBOUGHT: 80, VOL_MULTIPLIER: 1.5,
};

// --- Helpers ---
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = (gains / period) || 0;
  const avgLoss = (losses / period) || 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(data, period) {
  if (!data || data.length === 0) return 0;
  const effectivePeriod = Math.min(data.length, period);
  const slice = data.slice(-effectivePeriod);
  const sum = slice.reduce((a, b) => a + (parseFloat(b) || 0), 0);
  return (sum / effectivePeriod) || 0;
}

function calculateEMA(data, period) {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let emaArray = [];
    let initialSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    emaArray.push(initialSMA);
    for (let i = period; i < data.length; i++) {
        const ema = data[i] * k + emaArray[emaArray.length - 1] * (1 - k);
        emaArray.push(ema);
    }
    return new Array(period - 1).fill(null).concat(emaArray);
}

function calculateMACD(data, fastPeriod, slowPeriod, signalPeriod) {
    if (!data || data.length < slowPeriod) return { macd: 0, signal: 0, hist: 0 };
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    const macdLine = [];
    for(let i=0; i<data.length; i++) {
        if(fastEMA[i] != null && slowEMA[i] != null) macdLine.push(fastEMA[i] - slowEMA[i]);
        else macdLine.push(null);
    }
    const validMacdValues = macdLine.filter(v => v !== null);
    const signalLineRaw = calculateEMA(validMacdValues, signalPeriod);
    const lastMACD = macdLine[macdLine.length - 1] || 0;
    const lastSignal = signalLineRaw[signalLineRaw.length - 1] || 0;
    const lastHist = lastMACD - lastSignal;
    return { macd: lastMACD, signal: lastSignal, hist: lastHist };
}

function getSafeVolFactor(currentVol, sma) {
    const v = parseFloat(currentVol);
    const s = parseFloat(sma);
    if (!isFinite(v) || !isFinite(s) || s === 0) return "0.00";
    return (v / s).toFixed(2);
}

const formatHKTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    });
};

export default function App() {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  
  const [marketData, setMarketData] = useState({ price: 0, rsi: 0, volFactor: "0.00", ema: 0, macdHist: 0 });
  const [lastSignal, setLastSignal] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('連線中...');
  const [strategyTip, setStrategyTip] = useState("等待數據...");

  const candlesRef = useRef([]); 
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current || chartInstanceRef.current) return;

    // 1. Chart Init
    const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#A1A1AA', fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
        width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight,
        localization: { timeFormatter: formatHKTime, dateFormat: 'yyyy-MM-dd' },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#27272a', rightOffset: 2, barSpacing: 10, fixLeftEdge: true, tickMarkFormatter: (time) => formatHKTime(time) },
        rightPriceScale: { borderColor: '#27272a', scaleMargins: { top: 0.1, bottom: 0.2 }, autoScale: true },
    });
    chartInstanceRef.current = chart;

    // 2. Series
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', color: '#eab308' });
    volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    emaSeriesRef.current = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, crosshairMarkerVisible: false });

    // 3. Data
    const initDataStream = async () => {
        try {
            setConnectionStatus('下載數據中...');
            const response = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=500');
            const rawData = await response.json();
            const historyData = rawData.map(d => ({ time: d[0]/1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));

            candlesRef.current = historyData;
            candleSeriesRef.current.setData(historyData);
            volumeSeriesRef.current.setData(historyData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)' })));

            const closes = historyData.map(d => d.close);
            const emaValues = calculateEMA(closes, STRATEGY.EMA_PERIOD);
            const emaData = historyData.map((d, i) => ({ time: d.time, value: emaValues[i] })).filter(d => d.value !== null);
            emaSeriesRef.current.setData(emaData);

            setConnectionStatus('ONLINE');

            const ws = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@kline_1m');
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                const k = msg.k;
                const candle = { time: k.t/1000, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v) };
                
                if (candleSeriesRef.current) candleSeriesRef.current.update(candle);
                if (volumeSeriesRef.current) volumeSeriesRef.current.update({ time: candle.time, value: candle.volume, color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' });

                let hist = candlesRef.current;
                let calcHist = [...hist];
                const lastStored = calcHist[calcHist.length - 1];
                if (lastStored && lastStored.time === candle.time) calcHist[calcHist.length - 1] = candle; else calcHist.push(candle);

                const closePrices = calcHist.map(c => c.close);
                const fullEMA = calculateEMA(closePrices, STRATEGY.EMA_PERIOD);
                const currentEMA = fullEMA[fullEMA.length - 1];
                if (currentEMA) emaSeriesRef.current.update({ time: candle.time, value: currentEMA });
                
                const rsi = calculateRSI(closePrices, STRATEGY.RSI_PERIOD);
                const volSMA = calculateSMA(hist.map(c => c.volume), STRATEGY.VOL_MA_PERIOD);
                const volFactor = getSafeVolFactor(candle.volume, volSMA);
                const macdData = calculateMACD(closePrices, STRATEGY.MACD_FAST, STRATEGY.MACD_SLOW, STRATEGY.MACD_SIGNAL);

                setMarketData({ 
                    price: candle.close, 
                    rsi: rsi.toFixed(1), 
                    volFactor, 
                    ema: currentEMA ? currentEMA.toFixed(2) : 0,
                    macdHist: macdData.hist
                });

                const dist = (candle.close - currentEMA) / currentEMA * 100;
                let tip = "監測中...";
                if (rsi > 80) tip = "⚠️ 危險：RSI 超買！準備獲利離場。";
                else if (candle.close < currentEMA) tip = "📉 跌勢：價格喺 EMA 下面，忍手。";
                else if (macdData.hist < 0) tip = "🛑 觀察：MACD 動能弱，小心假突破。";
                else if (dist > 0.15) tip = "✋ 升過龍：離 EMA 太遠啦，等回調。";
                else if (dist >= 0 && dist <= 0.15) tip = "🎯 黃金位：回踩 EMA + MACD 轉強，準備！";
                setStrategyTip(tip);

                if (k.x) {
                    hist.push(candle);
                    if (hist.length > 500) hist.shift();
                    candlesRef.current = hist; 
                    
                    if (rsi > STRATEGY.RSI_THRESHOLD && rsi < STRATEGY.RSI_OVERBOUGHT && candle.volume > volSMA * STRATEGY.VOL_MULTIPLIER && macdData.hist > 0) {
                         const stopLoss = candle.low - (candle.high - candle.low);
                         setLastSignal({ type: '🚀 爆升突破', variant: 'success', price: candle.close, time: formatHKTime(candle.time), reason: `Vol ${volFactor}x • MACD✅`, sl: stopLoss.toFixed(2) });
                    }
                    else if (hist[hist.length-2].close < hist[hist.length-2].open && candle.close > candle.open &&
                        Math.abs((hist[hist.length-2].low - currentEMA)/currentEMA) < 0.0005 &&
                        candle.close > currentEMA && candle.volume > volSMA * 0.8 && macdData.hist > -0.2
                    ) {
                        const stopLoss = currentEMA - 0.5;
                        setLastSignal({ type: '🔵 EMA 回踩', variant: 'info', price: candle.close, time: formatHKTime(candle.time), reason: `EMA 撐住`, sl: stopLoss.toFixed(2) });
                    }
                    else if (rsi >= STRATEGY.RSI_OVERBOUGHT) {
                         setLastSignal({ type: '⚠️ 超買警告', variant: 'danger', price: candle.close, time: formatHKTime(candle.time), reason: `RSI ${rsi.toFixed(1)}` });
                    }
                }
            };
            return ws;
        } catch (e) { setConnectionStatus('連線錯誤'); }
    };
    const wsPromise = initDataStream();
    const resizeObserver = new ResizeObserver(entries => {
        if (!entries[0].contentRect) return;
        chart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
        setTimeout(() => chart.timeScale().fitContent(), 0);
    });
    resizeObserver.observe(chartContainerRef.current);
    return () => { wsPromise.then(ws => ws && ws.close()); chart.remove(); resizeObserver.disconnect(); chartInstanceRef.current = null; };
  }, []);

  const getRSIStatus = (rsi) => {
      if (rsi >= 80) return { color: '#ef4444', text: '⚠️ 危險' };
      if (rsi >= 55) return { color: '#4ade80', text: '🚀 強勢' };
      return { color: '#94a3b8', text: '⚪ 弱勢' };
  };
  const rsiStat = getRSIStatus(marketData.rsi);
  const volVal = parseFloat(marketData.volFactor);
  const macdVal = marketData.macdHist;

  return (
    <div style={styles.container}>
      <style>{`html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; max-width: none; background: #09090b; overflow: hidden; }`}</style>
      <div style={styles.header}>
        <div style={styles.statusDot} className={connectionStatus === 'ONLINE' ? 'pulse' : ''}></div>
        <div><h1 style={styles.title}>JINGUO SCALPER <span style={styles.proBadge}>V9.1</span></h1><p style={styles.subtitle}>PAXG/USDT • 1M • {connectionStatus}</p></div>
      </div>
      <div style={styles.grid}>
        <StatCard label="最新價格" value={marketData.price.toFixed(2)} unit="$" color="#FFFFFF" isMain={true} />
        <StatCard label="RSI (14)" value={marketData.rsi || 0} color={rsiStat.color} sub={rsiStat.text} />
        {/* [V9.1] 恢復了成交倍數卡 */}
        <StatCard label="成交倍數" value={marketData.volFactor || "0.00"} unit="x" color={volVal > 1.5 ? '#4ade80' : '#94a3b8'} sub={volVal > 1.5 ? "🚀 爆量" : "💤 縮量"} />
        {/* [V9.1] MACD 繼續保留 */}
        <StatCard label="MACD 動能" value={macdVal > 0 ? "BULL" : "BEAR"} unit="" color={macdVal > 0 ? '#4ade80' : '#ef4444'} sub={macdVal > 0 ? "▲ 上升中" : "▼ 下跌中"} />
        <StatCard label="EMA (20)" value={marketData.ema || 0} unit="$" color="#fbbf24" sub="支撐線" />
      </div>
      {lastSignal && (
        <div style={{...styles.alertBox, background: lastSignal.variant === 'danger' ? '#ef4444' : (lastSignal.variant === 'info' ? '#3b82f6' : '#4ade80')}}>
            <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                <span style={{fontSize: '1.5rem'}}>{lastSignal.variant === 'danger' ? '⚠️' : (lastSignal.variant === 'info' ? '🔵' : '🚀')}</span>
                <div>
                    <strong style={{ display:'block', color:'#000' }}>{lastSignal.type} @ {lastSignal.price}</strong>
                    <span style={{ fontSize: '0.9rem', color:'#000' }}>{lastSignal.time} • {lastSignal.reason} {lastSignal.sl && <span style={{marginLeft:'10px', background:'rgba(0,0,0,0.2)', padding:'2px 5px', borderRadius:'4px'}}>🛑 止蝕: {lastSignal.sl}</span>}</span>
                </div>
            </div>
        </div>
      )}
      <div style={styles.tipBar}><span style={{marginRight: '10px'}}>💡 教練提示:</span><span style={{color: '#fff', fontWeight: 'bold'}}>{strategyTip}</span></div>
      <div style={styles.chartWrapper}><div ref={chartContainerRef} style={styles.chartContainer} /></div>
      <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); } 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); } } .pulse { animation: pulse 2s infinite; }`}</style>
    </div>
  );
}

const styles = {
    container: { padding: '20px', background: '#09090b', color: '#f4f4f5', height: '100vh', width: '100vw', boxSizing: 'border-box', fontFamily: "'Roboto Mono', sans-serif", display: 'flex', flexDirection: 'column' },
    header: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', borderBottom: '2px solid #27272a', paddingBottom: '15px', flexShrink: 0 },
    statusDot: { width: '12px', height: '12px', background: '#4ade80', borderRadius: '50%' },
    title: { fontSize: '1.5rem', fontWeight: '700', margin: 0 },
    proBadge: { background: '#facc15', color: '#000', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'top', fontWeight: 'bold', marginLeft:'8px' },
    subtitle: { fontSize: '0.8rem', color: '#71717a', margin: '4px 0 0 0' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '15px', width: '100%', flexShrink: 0 },
    alertBox: { padding: '15px 20px', borderRadius: '8px', marginBottom: '15px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box', flexShrink: 0 },
    tipBar: { background: '#1e293b', borderLeft: '4px solid #3b82f6', padding: '10px 15px', borderRadius: '4px', marginBottom: '15px', fontSize: '0.9rem', color: '#94a3b8', flexShrink: 0 },
    chartWrapper: { flexGrow: 1, width: '100%', position: 'relative', background: '#000', border: '2px solid #27272a', borderRadius: '8px', overflow: 'hidden' },
    chartContainer: { width: '100%', height: '100%' },
};

function StatCard({ label, value, unit, color, sub, isMain }) {
    return (
        <div style={{ background: '#18181b', padding: '15px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '5px', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: isMain ? '2rem' : '1.5rem', fontWeight: '700', color: color, fontFamily: "'Roboto Mono', monospace" }}>{unit==='$'?unit:''}{value}{unit==='x'?unit:''}<span style={{fontSize:'0.8rem', color: color, marginLeft:'5px', fontWeight:'normal', opacity:0.8}}>{sub}</span></div>
        </div>
    );
}
