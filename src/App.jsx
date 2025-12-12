import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { CONFIG } from './config'; 

// --- Supabase Init ---
const { createClient } = window.supabase || { createClient: () => null };
const supabase = window.supabase ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY) : null;
const STRATEGY = CONFIG.STRATEGY;

// --- Indicators (Standard) ---
const calculateSMA = (data, period) => {
  if (!data || data.length === 0) return 0;
  const slice = data.slice(-Math.min(data.length, period));
  return (slice.reduce((a, b) => a + (parseFloat(b) || 0), 0) / slice.length) || 0;
};
const calculateEMA = (data, period) => {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let ema = [data.slice(0, period).reduce((a,b)=>a+b,0)/period];
    for (let i = period; i < data.length; i++) ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
    return new Array(period - 1).fill(null).concat(ema);
};
const calculateRSI = (prices, period=14) => {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  return 100 - (100 / (1 + ((gains / period) / (losses / period || 1))));
};
const calculateATR = (h, l, c, p) => {
    if (!h || h.length < p+1) return 1;
    let trs = [];
    for(let i=1; i<h.length; i++) trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    return trs.slice(-Math.min(trs.length, p)).reduce((a,b)=>a+b,0)/Math.min(trs.length, p);
};
const calculateADX = (highs, lows, closes, period) => {
    if(highs.length < period * 2) return 0;
    let tr = [], dmPlus = [], dmMinus = [];
    for(let i=1; i<highs.length; i++) {
        tr.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
        dmPlus.push(highs[i]-highs[i-1] > lows[i-1]-lows[i] ? Math.max(highs[i]-highs[i-1], 0) : 0);
        dmMinus.push(lows[i-1]-lows[i] > highs[i]-highs[i-1] ? Math.max(lows[i-1]-lows[i], 0) : 0);
    }
    const smooth = (data, p) => {
        let res = [data.slice(0,p).reduce((a,b)=>a+b,0)]; 
        for(let i=p; i<data.length; i++) res.push(res[res.length-1] - (res[res.length-1]/p) + data[i]);
        return res;
    };
    const trS = smooth(tr, period);
    const dmPS = smooth(dmPlus, period);
    const dmMS = smooth(dmMinus, period);
    let dx = [];
    for(let i=0; i<trS.length; i++) {
        const diPlus = 100 * (dmPS[i]/trS[i]);
        const diMinus = 100 * (dmMS[i]/trS[i]);
        dx.push(100 * Math.abs(diPlus - diMinus) / (diPlus + diMinus));
    }
    return (dx.slice(-period).reduce((a,b)=>a+b,0)/period) || 0;
};

const formatHKTime = (ts) => new Date(ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Hong_Kong'});
const toInputFormat = (ts) => { const d = new Date(ts); return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16); };

export default function App() {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  
  const [marketData, setMarketData] = useState({ price: 0, rsi: 0, adx: 0, volFactor: "0.00", emaFast: 0, emaSlow: 0, support: 0, resistance: 0 });
  const [activeSignal, setActiveSignal] = useState(null); 
  const [tradeHistory, setTradeHistory] = useState([]); 
  const [connectionStatus, setConnectionStatus] = useState('連線中...');
  const [strategyTip, setStrategyTip] = useState("初始化...");
  const [tradeSetup, setTradeSetup] = useState(null);
  const [chartReady, setChartReady] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null); // Backtest Stats UI
  
  const [capital, setCapital] = useState(1000); 
  const [riskPct, setRiskPct] = useState(2);     
  const [leverage, setLeverage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false); 
  const [filterMode, setFilterMode] = useState('preset'); 
  const [presetPeriod, setPresetPeriod] = useState(0); 
  const [customRange, setCustomRange] = useState({ start: Date.now() - 86400000, end: Date.now() }); 

  const candlesRef = useRef([]); 
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const emaFastSeriesRef = useRef(null);
  const emaSlowSeriesRef = useRef(null);
  const supportLineRef = useRef(null);
  const resistanceLineRef = useRef(null);
  const activeSignalRef = useRef(null);

  useEffect(() => { document.title = "Jinguo V33.0 Complete"; }, []);

  // --- Instant Backtest Logic ---
  const runBacktest = () => {
    if (!candlesRef.current || candlesRef.current.length < 100) return;
    setBacktestResult(null);
    setTimeout(() => {
        const candles = candlesRef.current;
        let balance = capital;
        let trades = [];
        let pendingOrder = null;
        let activeTrade = null;
        
        for (let i = 50; i < candles.length; i++) {
            const candle = candles[i];
            const h = candles.slice(0, i+1);
            const closes = h.map(c=>c.close);
            
            const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST).pop();
            const rsi = calculateRSI(closes, STRATEGY.RSI_PERIOD);
            const atr = calculateATR(h.map(c=>c.high), h.map(c=>c.low), closes, STRATEGY.ATR_PERIOD);
            const volSMA = calculateSMA(h.map(c=>c.volume), STRATEGY.VOL_MA_PERIOD);
            
            if (activeTrade) {
                if (candle.low <= activeTrade.sl) {
                    const lossAmt = (activeTrade.size * (activeTrade.entry - activeTrade.sl));
                    balance -= lossAmt;
                    trades.push({...activeTrade, exitPrice: activeTrade.sl, status: 'LOSS', exitTime: candle.time});
                    activeTrade = null;
                } else if (candle.high >= activeTrade.tp) {
                    const winAmt = (activeTrade.size * (activeTrade.tp - activeTrade.entry));
                    balance += winAmt;
                    trades.push({...activeTrade, exitPrice: activeTrade.tp, status: 'WIN', exitTime: candle.time});
                    activeTrade = null;
                }
                continue;
            }

            if (pendingOrder) {
                if (candle.low <= pendingOrder.entry) { activeTrade = pendingOrder; pendingOrder = null; } 
                else if ((candle.time - pendingOrder.timestamp/1000) > 3600) pendingOrder = null;
            }

            // Sim Strategy
            const isGreen = candle.close > candle.open;
            const bodySize = Math.abs(candle.close - candle.open);
            const isBigBody = bodySize > atr * STRATEGY.JINGUO_BODY_SIZE; 
            const isVolumeOk = candle.volume > volSMA * STRATEGY.VOL_MULTIPLIER;
            const isTrendOk = candle.close > emaFast;
            const isRsiOk = rsi >= STRATEGY.RSI_MIN && rsi <= STRATEGY.RSI_MAX;

            if (!activeTrade && !pendingOrder && isGreen && isBigBody && isVolumeOk && isTrendOk && isRsiOk) {
                const entry = candle.open + (bodySize * STRATEGY.RETRACE_RATIO);
                const stop = candle.low - 0.5;
                const risk = Math.abs(entry - stop);
                const target = entry + (risk * STRATEGY.RISK_REWARD);
                const riskAmt = capital * (riskPct / 100);
                const size = Math.min(riskAmt / risk, (capital * leverage) / entry);
                
                pendingOrder = { entry, sl: stop, tp: target, size, timestamp: candle.time * 1000, type: 'BUY' };
            }
        }

        const wins = trades.filter(t=>t.status==='WIN').length;
        const losses = trades.filter(t=>t.status==='LOSS').length;
        const total = wins + losses;
        const wr = total > 0 ? ((wins/total)*100).toFixed(0) : 0;
        const pnl = balance - capital;
        
        setBacktestResult({
            totalTrades: total, winRate: wr, wins, losses, pnl: pnl.toFixed(2), finalBalance: balance.toFixed(2), period: (candles.length / 60).toFixed(1)
        });
        
        const simHistory = trades.reverse().map(d => ({
            status: d.status, price: d.entry.toFixed(2), exitPrice: d.exitPrice.toFixed(2),
            exitTime: formatHKTime(d.exitTime),
            time: formatHKTime(d.timestamp/1000),
            entryTimeRaw: d.timestamp/1000, timestamp: d.timestamp
        }));
        setTradeHistory(simHistory);
        setShowSettings(false); 
    }, 100);
  };

  // --- Fetch & Realtime ---
  useEffect(() => {
    if(!supabase) return;
    const loadData = async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase.from('trades').select('*').gte('entry_time', thirtyDaysAgo).order('entry_time', { ascending: false }).limit(2000);
        if (data) {
            const mapped = data.map(d => ({
                status: d.status, price: d.entry_price, exitPrice: d.exit_price,
                exitTime: d.exit_time ? new Date(d.exit_time).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : '-',
                time: new Date(d.entry_time).toLocaleString('en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
                entryTimeRaw: new Date(d.entry_time).getTime()/1000, timestamp: new Date(d.entry_time).getTime()
            }));
            setTradeHistory(mapped); 
        }
    };
    loadData();
    const channel = supabase.channel('trades_live').on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const recordTrade = async (signal, resultStatus, exitPrice, candleTime) => {
      if(!supabase) return;
      await supabase.from('trades').insert({
          type: signal.type, status: resultStatus, entry_price: signal.price, exit_price: exitPrice, tp: signal.tp, sl: signal.sl, entry_time: new Date(signal.timestamp).toISOString(), exit_time: new Date(candleTime * 1000).toISOString()
      });
  };

  useEffect(() => {
      if(chartReady && candleSeriesRef.current && tradeHistory.length > 0) {
          try {
              const markers = tradeHistory.map(t => ({
                  time: t.entryTimeRaw, position: t.status === 'WIN' ? 'belowBar' : 'aboveBar', color: t.status === 'WIN' ? '#4ade80' : '#ef4444', shape: t.status === 'WIN' ? 'arrowUp' : 'arrowDown', text: t.status === 'WIN' ? 'WIN' : 'LOSS',
              }));
              markers.sort((a,b) => a.time - b.time);
              if (typeof candleSeriesRef.current.setMarkers === 'function') candleSeriesRef.current.setMarkers(markers);
          } catch (e) {}
      }
  }, [tradeHistory, chartReady]);

  const updateSupportResistance = (series, candles) => {
      if (!series || candles.length < STRATEGY.LOOKBACK_PERIOD) return;
      const recent = candles.slice(-STRATEGY.LOOKBACK_PERIOD);
      const low = Math.min(...recent.map(c => c.low));
      const high = Math.max(...recent.map(c => c.high));
      if (supportLineRef.current) series.removePriceLine(supportLineRef.current);
      if (resistanceLineRef.current) series.removePriceLine(resistanceLineRef.current);
      resistanceLineRef.current = series.createPriceLine({ price: high, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'RESISTANCE' });
      supportLineRef.current = series.createPriceLine({ price: low, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'SUPPORT' });
      return { low, high };
  };

  // --- Chart & Strategy ---
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if(chartInstanceRef.current) { chartInstanceRef.current.remove(); chartInstanceRef.current = null; }

    const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#A1A1AA', fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
        width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight,
        localization: { timeFormatter: formatHKTime, dateFormat: 'yyyy-MM-dd' },
        timeScale: { 
            timeVisible: true, secondsVisible: false, borderColor: '#27272a', rightOffset: 12, barSpacing: 10, fixLeftEdge: true, tickMarkFormatter: formatHKTime,
            shiftVisibleRangeOnNewBar: false // [V33] Prevent Force Scroll
        },
        rightPriceScale: { borderColor: '#27272a', scaleMargins: { top: 0.1, bottom: 0.2 }, autoScale: true },
    });
    chartInstanceRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', color: '#eab308' });
    volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    emaFastSeriesRef.current = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, title: 'EMA(20)' });
    emaSlowSeriesRef.current = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, lineStyle: 2, title: 'EMA(50)' });

    const initDataStream = async () => {
        try {
            const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=1000');
            const raw = await res.json();
            const hist = raw.map(d => ({ time: d[0]/1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
            candlesRef.current = hist;
            if(candleSeriesRef.current) { candleSeriesRef.current.setData(hist); setChartReady(true); }
            if(volumeSeriesRef.current) volumeSeriesRef.current.setData(hist.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)' })));
            
            const closes = hist.map(d=>d.close);
            const emaFast = calculateEMA(closes, STRATEGY.EMA_FAST);
            const emaSlow = calculateEMA(closes, STRATEGY.EMA_SLOW);
            if(emaFastSeriesRef.current) emaFastSeriesRef.current.setData(hist.map((d,i)=>({time:d.time, value:emaFast[i]})).filter(d=>d.value!=null));
            if(emaSlowSeriesRef.current) emaSlowSeriesRef.current.setData(hist.map((d,i)=>({time:d.time, value:emaSlow[i]})).filter(d=>d.value!=null));
            
            updateSupportResistance(candleSeriesRef.current, hist);
            setConnectionStatus('ONLINE');
            const now = hist[hist.length-1].time;
            chart.timeScale().setVisibleRange({ from: now - (CONFIG.DEFAULT_ZOOM_HOURS * 3600), to: now + (10 * 60) });

            const ws = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@kline_1m');
            ws.onmessage = (e) => {
                const k = JSON.parse(e.data).k;
                const candle = { time: k.t/1000, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v) };
                
                if (candleSeriesRef.current) candleSeriesRef.current.update(candle);
                if (volumeSeriesRef.current) volumeSeriesRef.current.update({ time: candle.time, value: candle.volume, color: candle.close>=candle.open?'rgba(34, 197, 94, 0.5)':'rgba(239, 68, 68, 0.5)'});

                let h = candlesRef.current;
                let ch = [...h];
                if (ch[ch.length-1] && ch[ch.length-1].time===candle.time) ch[ch.length-1]=candle; else ch.push(candle);
                candlesRef.current = ch;
                
                const closes = ch.map(c=>c.close);
                const fullEmaFast = calculateEMA(closes, STRATEGY.EMA_FAST);
                const fullEmaSlow = calculateEMA(closes, STRATEGY.EMA_SLOW);
                const curEmaFast = fullEmaFast[fullEmaFast.length-1];
                const curEmaSlow = fullEmaSlow[fullEmaSlow.length-1];
                if (curEmaFast && emaFastSeriesRef.current) emaFastSeriesRef.current.update({time:candle.time, value:curEmaFast});
                if (curEmaSlow && emaSlowSeriesRef.current) emaSlowSeriesRef.current.update({time:candle.time, value:curEmaSlow});
                
                const srLevels = updateSupportResistance(candleSeriesRef.current, ch);
                const rsi = calculateRSI(closes, STRATEGY.RSI_PERIOD);
                const atr = calculateATR(ch.map(c=>c.high), ch.map(c=>c.low), closes, STRATEGY.ATR_PERIOD);
                const volSMA = calculateSMA(h.map(c=>c.volume), STRATEGY.VOL_MA_PERIOD);
                const volFactor = (candle.volume/(volSMA||1)).toFixed(2);
                const adx = calculateADX(ch.map(c=>c.high), ch.map(c=>c.low), closes, STRATEGY.ADX_PERIOD);

                setMarketData({ price: candle.close, rsi: rsi.toFixed(1), adx: adx.toFixed(1), volFactor, emaFast: curEmaFast?curEmaFast.toFixed(2):0, emaSlow: curEmaSlow?curEmaSlow.toFixed(2):0, support: srLevels?.low, resistance: srLevels?.high });

                // [V33 Smart Scroll]
                if (chartInstanceRef.current) {
                    const timeScale = chartInstanceRef.current.timeScale();
                    const logicalRange = timeScale.getVisibleLogicalRange();
                    if (logicalRange && (candlesRef.current.length - logicalRange.to) < 2) {
                         timeScale.scrollToRealTime();
                    }
                }

                // Strategy (Live)
                const isGreen = candle.close > candle.open;
                const bodySize = Math.abs(candle.close - candle.open);
                const isBigBody = bodySize > atr * STRATEGY.JINGUO_BODY_SIZE; 
                const isVolumeOk = candle.volume > volSMA * STRATEGY.VOL_MULTIPLIER; 
                const isTrendOk = candle.close > curEmaFast; 
                const isRsiOk = rsi >= STRATEGY.RSI_MIN && rsi <= STRATEGY.RSI_MAX; 

                const jinguoEntry = (candle.open + (bodySize * STRATEGY.RETRACE_RATIO)); 
                const jinguoStop = candle.low - 0.5;
                const riskPerShare = jinguoEntry - jinguoStop;
                const jinguoTarget = jinguoEntry + (riskPerShare * STRATEGY.RISK_REWARD);

                if (activeSignalRef.current) {
                    const signal = activeSignalRef.current;
                    const elapsedMin = (Date.now() - signal.timestamp) / 60000;
                    if (candle.high >= signal.tp) { recordTrade(signal, 'WIN', signal.tp, candle.time); setActiveSignal(null); activeSignalRef.current = null; }
                    else if (candle.low <= signal.sl) { recordTrade(signal, 'LOSS', signal.sl, candle.time); setActiveSignal(null); activeSignalRef.current = null; }
                    else if (elapsedMin > 60) { setActiveSignal(null); activeSignalRef.current = null; }
                }

                const calcSize = (entry, stop) => {
                    const riskAmt = capital * (riskPct / 100);
                    const risk = Math.abs(entry - stop);
                    if(risk === 0) return 0;
                    return Math.min(riskAmt / risk, (capital * leverage) / entry).toFixed(4);
                };

                let tip = "監測中...", setup = null;
                if (!isTrendOk) tip = "📉 價格低於 EMA20，觀望。";
                else if (isGreen && isBigBody && isVolumeOk && isRsiOk) {
                    tip = "🔥 實時信號！等待回調...";
                    setup = { type: 'LIMIT BUY', entry: jinguoEntry.toFixed(2), target: jinguoTarget.toFixed(2), stop: jinguoStop.toFixed(2), size: calcSize(jinguoEntry, jinguoStop) };
                    if (k.x && !activeSignalRef.current) {
                        const signalTime = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                        const newSignal = { type: '🔥 JINGUO LIVE', variant: 'success', price: jinguoEntry, time: formatHKTime(candle.time), created: signalTime, tp: parseFloat(jinguoTarget.toFixed(2)), sl: parseFloat(jinguoStop.toFixed(2)), timestamp: Date.now(), entryTimeRaw: candle.time };
                        setActiveSignal(newSignal); activeSignalRef.current = newSignal;
                    }
                } else { tip = "👀 趨勢向上，等待放量..."; }
                setStrategyTip(tip);
                setTradeSetup(setup);
            };
            return ws;
        } catch (e) { setConnectionStatus('Err'); }
    };
    const wsPromise = initDataStream();
    
    const ro = new ResizeObserver(e => { if(e[0].contentRect && chartInstanceRef.current) chartInstanceRef.current.applyOptions({ width:e[0].contentRect.width, height:e[0].contentRect.height }); });
    ro.observe(chartContainerRef.current);
    return () => { setChartReady(false); wsPromise.then(w=>w&&w.close()); if(chartInstanceRef.current) chartInstanceRef.current.remove(); ro.disconnect(); chartInstanceRef.current=null; candleSeriesRef.current=null; };
  }, [capital, riskPct, leverage]);

  // UI
  const rsiStat = (r) => r>=70 ? {c:'#ef4444',t:'⚠️ 高位'} : (r>=45 ? {c:'#4ade80',t:'🚀 健康'} : {c:'#94a3b8',t:'⚪ 弱勢'});
  const rs = rsiStat(marketData.rsi);
  const adxStat = (a) => a>=25 ? {c:'#4ade80',t:'🔥 強勢'} : {c:'#71717a',t:'💤 盤整'};
  const as = adxStat(marketData.adx);
  const riskAmt = (capital * (riskPct/100)).toFixed(0);
  
  const filteredHistory = tradeHistory.filter(t => {
      if (!t.timestamp) return false;
      if (filterMode === 'preset') {
          if (presetPeriod === 0) return true;
          const elapsedMin = (Date.now() - t.timestamp) / (1000 * 60);
          return elapsedMin >= -1 && elapsedMin <= presetPeriod;
      } else { return t.timestamp >= customRange.start && t.timestamp <= customRange.end; }
  });
  const wins = filteredHistory.filter(t => t.status === 'WIN').length;
  const losses = filteredHistory.filter(t => t.status === 'LOSS').length;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;
  const presets = [{ label: '1H', val: 60 }, { label: '4H', val: 240 }, { label: '24H', val: 1440 }, { label: 'All', val: 0 }];
  const clearHistory = async () => { if(supabase && window.confirm('Clear all?')) { await supabase.from('trades').delete().neq('id', 0); setTradeHistory([]); } };

  const isMobile = window.innerWidth < 768;
  const styles = {
      container: { padding: isMobile ? '10px' : '20px', background: '#09090b', color: '#f4f4f5', height: '100vh', width: '100vw', boxSizing: 'border-box', fontFamily: "'Roboto Mono', sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      header: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', borderBottom: '2px solid #27272a', paddingBottom: '10px', flexShrink: 0 },
      statusDot: { width: '10px', height: '10px', background: '#4ade80', borderRadius: '50%' },
      title: { fontSize: isMobile ? '1.1rem' : '1.5rem', fontWeight: '700', margin: 0 },
      proBadge: { background: '#f59e0b', color: '#000', fontSize: '0.6rem', padding: '2px 4px', borderRadius: '4px', verticalAlign: 'top', fontWeight: 'bold', marginLeft: '5px' },
      subtitle: { fontSize: '0.7rem', color: '#71717a', margin: '2px 0 0 0' },
      settingsBtn: { background: '#27272a', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight:'bold' },
      settingsPanel: { background: '#18181b', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #3f3f46' },
      input: { background: '#000', border: '1px solid #3f3f46', color: '#fff', padding: '8px', borderRadius: '4px', marginLeft: '5px', width: '70px', fontSize: '1rem' },
      gridRow1: { display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px', flexShrink: 0 },
      gridRow2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px', flexShrink: 0 },
      
      backtestPanel: {
          background: 'linear-gradient(90deg, #172554 0%, #1e3a8a 100%)', // Deep Blue
          padding: '12px 20px', borderRadius: '8px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #3b82f6', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)', flexWrap: 'wrap', gap: '10px', flexShrink: 0
      },
      btStat: { display:'flex', flexDirection:'column', alignItems:'center' },
      btLabel: { fontSize: '0.7rem', color: '#93c5fd', textTransform:'uppercase', letterSpacing:'1px' },
      btValue: { fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' },
      
      alertBox: { padding: '10px', borderRadius: '8px', marginBottom: '10px', fontWeight: 'bold', width: '100%', boxSizing: 'border-box', flexShrink: 0 },
      tipBar: { background: '#1e293b', borderLeft: '4px solid #3b82f6', padding: '8px 12px', borderRadius: '4px', fontSize: '0.85rem', color: '#94a3b8', marginBottom: isMobile ? '5px' : '0', flexGrow: 1, display: 'flex', alignItems: 'center' },
      setupBox: { background: '#18181b', border: '1px solid #27272a', borderRadius: '4px', padding: '8px 12px', flexGrow: 1.5 },
      chartWrapper: { flexGrow: 1, width: '100%', position: 'relative', background: '#000', border: '1px solid #27272a', borderRadius: '8px', overflow: 'hidden', minHeight: isMobile ? '300px' : '400px' },
      chartContainer: { width: '100%', height: '100%' },
      closeBtn: { background: 'rgba(0,0,0,0.2)', border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.2rem'},
      historyPanel: { position: 'absolute', top: isMobile ? '60px' : '80px', right: isMobile ? '10px' : '20px', left: isMobile ? '10px' : 'auto', width: isMobile ? 'auto' : '320px', background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', padding: '15px', zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.8)', maxHeight: '60vh' },
      filterBtn: { background: 'transparent', color: '#71717a', border: '1px solid #27272a', cursor: 'pointer', fontSize: '0.75rem', borderRadius: '4px', padding: '6px 10px', minWidth: '40px' },
      filterBtnActive: { background: '#3b82f6', color: '#fff', border: '1px solid #3b82f6', cursor: 'pointer', fontSize: '0.75rem', borderRadius: '4px', padding: '6px 10px', minWidth: '40px', fontWeight: 'bold' },
      toggleBtn: { background: 'transparent', color: '#3b82f6', border: 'none', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' },
      dateInput: { background: '#000', border: '1px solid #3f3f46', color: '#fff', padding: '8px', borderRadius: '4px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }
  };

  function StatCard({ label, value, unit, color, sub, isMain }) {
    return (
        <div style={{ background: '#18181b', padding: '15px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '5px' }}>{label}</div>
            <div style={{ fontSize: isMain ? '2rem' : '1.5rem', fontWeight: '700', color: color, fontFamily: "'Roboto Mono', monospace" }}>{unit==='$'?unit:''}{value}{unit==='x'?unit:''}<span style={{fontSize:'0.8rem', color: color, marginLeft:'5px', fontWeight:'normal', opacity:0.8}}>{sub}</span></div>
        </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.statusDot} className={connectionStatus==='ONLINE'?'pulse':''}></div>
        <div style={{flexGrow:1}}>
            <h1 style={styles.title}>JINGUO SCALPER <span style={styles.proBadge}>V33</span></h1>
            <p style={styles.subtitle}>PAXG/USDT • 1M • {supabase ? "DB OK" : "DB Missing"}</p>
        </div>
        <div style={{display:'flex', gap:'10px', marginRight:'5px', alignItems:'center'}}>
             <div onClick={()=>setShowHistory(!showHistory)} style={{cursor:'pointer', background:'#27272a', padding:'5px 10px', borderRadius:'4px', border:'1px solid #3f3f46', fontSize:'0.8rem', color:'#fff'}}>
                 <span style={{color:winRate>=60?'#4ade80':'#ef4444', fontWeight:'bold'}}>{winRate}% ({wins}W)</span>
             </div>
        </div>
        <button onClick={()=>setShowSettings(!showSettings)} style={styles.settingsBtn}>⚙️</button>
      </div>

      {showSettings && (
          <div style={styles.settingsPanel}>
              <div style={{display:'flex', gap:'15px', alignItems:'center', flexWrap:'wrap'}}>
                  <label>本金: <input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value))} style={styles.input} /></label>
                  <label>Risk%: <input type="number" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value))} style={styles.input} /></label>
                  <label>槓桿: <input type="number" value={leverage} onChange={e=>setLeverage(Number(e.target.value))} style={styles.input} /></label>
                  <button onClick={runBacktest} style={{background:'#3b82f6', color:'#fff', border:'none', padding:'5px 15px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', fontSize:'0.9rem', boxShadow:'0 0 10px rgba(59, 130, 246, 0.5)'}}>
                    ▶ 立即回測
                  </button>
                  <button onClick={clearHistory} style={{background:'#ef4444', color:'#fff', border:'none', padding:'5px 10px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Reset DB</button>
              </div>
          </div>
      )}

      {showHistory && (
          <div style={styles.historyPanel}>
              <div style={{borderBottom:'1px solid #3f3f46', paddingBottom:'10px', marginBottom:'10px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                      <strong>交易記錄 ({tradeHistory.length})</strong>
                      <button onClick={()=>setFilterMode(filterMode==='preset'?'custom':'preset')} style={styles.toggleBtn}>{filterMode==='preset'?'自定義':'預設'}</button>
                  </div>
                  {filterMode === 'preset' ? (
                      <div style={{display:'flex', gap:'5px', flexWrap:'wrap'}}>
                          {presets.map(p => (<button key={p.label} onClick={()=>setPresetPeriod(p.val)} style={presetPeriod===p.val?styles.filterBtnActive:styles.filterBtn}>{p.label}</button>))}
                      </div>
                  ) : (
                      <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                          <input type="datetime-local" style={styles.dateInput} value={toInputFormat(customRange.start)} onChange={e=>setCustomRange({...customRange, start: new Date(e.target.value).getTime()})} />
                          <input type="datetime-local" style={styles.dateInput} value={toInputFormat(customRange.end)} onChange={e=>setCustomRange({...customRange, end: new Date(e.target.value).getTime()})} />
                      </div>
                  )}
              </div>
              <div style={{maxHeight:'300px', overflowY:'auto'}}>
                  {filteredHistory.map((t, i) => (
                      <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem', padding:'8px 0', borderBottom:'1px solid #27272a'}}>
                          <div>
                              <span style={{color:t.status==='WIN'?'#4ade80':'#ef4444', fontWeight:'bold', marginRight:'10px'}}>{t.status}</span>
                              <span style={{color:'#94a3b8'}}>{t.time}</span>
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{color:'#fff'}}>In: {t.price}</div>
                              {t.exitPrice && <div style={{color:'#71717a', fontSize:'0.75rem'}}>Out: {t.exitPrice}</div>}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      <div style={styles.gridRow1}>
        <StatCard label="現價" value={marketData.price.toFixed(2)} unit="$" color="#FFFFFF" isMain={true} />
        <StatCard label="RSI" value={marketData.rsi || 0} color={rs.c} sub={rs.t} />
        <StatCard label="ADX" value={marketData.adx || 0} color={as.c} sub={as.t} />
        <StatCard label="EMA(20)" value={marketData.emaFast || 0} unit="$" color="#fbbf24" sub={marketData.emaFast>marketData.emaSlow?"📈 Bull":"📉 Bear"} />
      </div>
      <div style={styles.gridRow2}>
        <StatCard label="支撐 (Low 50)" value={marketData.support?.toFixed(2) || "---"} unit="$" color="#22c55e" sub="Sup" />
        <StatCard label="阻力 (High 50)" value={marketData.resistance?.toFixed(2) || "---"} unit="$" color="#ef4444" sub="Res" />
      </div>

      {/* Backtest Result Panel */}
      {backtestResult && (
          <div style={styles.backtestPanel}>
              <div style={{display:'flex', alignItems:'center', gap:'15px', flexGrow:1, flexWrap:'wrap', justifyContent:'space-around'}}>
                  <div style={styles.btStat}><span style={styles.btLabel}>SIM PERIOD</span><span style={styles.btValue}>{backtestResult.period}h</span></div>
                  <div style={styles.btStat}><span style={styles.btLabel}>TOTAL TRADES</span><span style={styles.btValue}>{backtestResult.totalTrades}</span></div>
                  <div style={styles.btStat}><span style={styles.btLabel}>WIN RATE</span><span style={{...styles.btValue, color: backtestResult.winRate>50?'#4ade80':'#ef4444'}}>{backtestResult.winRate}%</span></div>
                  <div style={styles.btStat}><span style={styles.btLabel}>NET PNL</span><span style={{...styles.btValue, color: parseFloat(backtestResult.pnl)>0?'#4ade80':'#ef4444'}}>${backtestResult.pnl}</span></div>
                  <div style={styles.btStat}><span style={styles.btLabel}>FINAL BAL</span><span style={{...styles.btValue, color:'#93c5fd'}}>${backtestResult.finalBalance}</span></div>
              </div>
              <button onClick={()=>{setBacktestResult(null); setTradeHistory([]);}} style={{...styles.closeBtn, background:'rgba(255,255,255,0.1)', color:'#fff'}}>✕</button>
          </div>
      )}

      {activeSignal && (
        <div style={{...styles.alertBox, background: '#4ade80'}}>
            <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                <span style={{fontSize: '1.5rem'}}>🚀</span>
                <div style={{flexGrow:1}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <strong style={{fontSize:'1.1rem',color:'#000'}}>SIGNAL: {activeSignal.price}</strong>
                        <button onClick={()=>{setActiveSignal(null); activeSignalRef.current=null;}} style={styles.closeBtn}>✕</button>
                    </div>
                    <div style={{fontSize:'0.8rem', color:'#000', marginBottom:'5px'}}>Created: {activeSignal.created}</div>
                    <div style={{marginTop:'5px', paddingTop:'5px', borderTop:'1px solid rgba(0,0,0,0.1)', display:'flex', gap:'15px', fontSize:'0.95rem', color:'#000', fontWeight:'bold'}}>
                             <span>🎯 {activeSignal.tp}</span><span>🛑 {activeSignal.sl}</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div style={{display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'stretch', flexDirection: isMobile ? 'column' : 'row'}}>
          <div style={styles.tipBar}><span>💡 教練:</span> <span style={{color:'#fff',fontWeight:'bold',marginLeft:'5px'}}>{strategyTip}</span></div>
          {tradeSetup && (
             <div style={styles.setupBox}>
                 <div style={{fontSize:'0.7rem', color:'#94a3b8', marginBottom:'5px', display:'flex', justifyContent:'space-between'}}><span>建議部署</span><span style={{color:'#ef4444'}}>Risk: ${riskAmt}</span></div>
                 <div style={{display:'flex', gap:'15px', fontSize:'0.9rem', fontWeight:'bold', alignItems:'center'}}>
                     <span style={{color:'#fff', background:'#27272a', padding:'2px 6px', borderRadius:'4px'}}>掛 {tradeSetup.size} 股</span>
                     <span style={{color:'#3b82f6'}}>@ {tradeSetup.entry}</span>
                     <span style={{color:'#ef4444'}}>🛑 {tradeSetup.stop}</span>
                 </div>
             </div>
          )}
      </div>

      <div style={styles.chartWrapper}><div ref={chartContainerRef} style={styles.chartContainer} /></div>
    </div>
  );
}
