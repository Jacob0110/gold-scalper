import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';

// --- Config ---
const STRATEGY = {
  RSI_PERIOD: 14, VOL_MA_PERIOD: 20, EMA_PERIOD: 20,
  MACD_FAST: 12, MACD_SLOW: 26, MACD_SIGNAL: 9, 
  RSI_THRESHOLD: 55, RSI_OVERBOUGHT: 80, VOL_MULTIPLIER: 1.5, ATR_PERIOD: 14,
  LOOKBACK_PERIOD: 50,
  ENTRY_PULLBACK: 0.02 // [V18.0] % pullback from high for limit buy
};

// --- Helpers (Same as before) ---
const calculateRSI = (prices, period=14) => {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = (gains / period) || 0;
  const avgLoss = (losses / period) || 0;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (avgGain / avgLoss)));
};
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
const calculateMACD = (data, f, s, sig) => {
    if (!data || data.length < s) return { macd: 0, signal: 0, hist: 0 };
    const fast = calculateEMA(data, f);
    const slow = calculateEMA(data, s);
    const macdLine = data.map((_, i) => (fast[i]!=null && slow[i]!=null) ? fast[i]-slow[i] : null);
    const validMacd = macdLine.filter(v => v !== null);
    const signalLine = calculateEMA(validMacd, sig);
    const lastM = macdLine[macdLine.length-1]||0;
    const lastS = signalLine[signalLine.length-1]||0;
    return { macd: lastM, signal: lastS, hist: lastM - lastS };
};
const calculateATR = (h, l, c, p) => {
    if (!h || h.length < p+1) return 1;
    let trs = [];
    for(let i=1; i<h.length; i++) trs.push(Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    return trs.slice(-Math.min(trs.length, p)).reduce((a,b)=>a+b,0)/Math.min(trs.length, p);
};

const formatHKTime = (ts) => new Date(ts*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Hong_Kong'});

const toInputFormat = (ts) => {
    const d = new Date(ts);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
};

export default function App() {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  
  const [marketData, setMarketData] = useState({ price: 0, rsi: 0, volFactor: "0.00", ema: 0, macdHist: 0, atr: 0, support: 0, resistance: 0 });
  const [activeSignal, setActiveSignal] = useState(null); 
  const [tradeHistory, setTradeHistory] = useState([]);   
  const [connectionStatus, setConnectionStatus] = useState('連線中...');
  const [strategyTip, setStrategyTip] = useState("等待數據...");
  const [tradeSetup, setTradeSetup] = useState(null);
  
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
  const emaSeriesRef = useRef(null);
  const supportLineRef = useRef(null);
  const resistanceLineRef = useRef(null);
  const activeSignalRef = useRef(null);

  useEffect(() => { document.title = "Jinguo Scalper V18.0"; }, []);

  useEffect(() => {
      if(candleSeriesRef.current && tradeHistory.length > 0) {
          const markers = tradeHistory.map(t => ({
              time: t.entryTimeRaw, 
              position: t.status === 'WIN' ? 'belowBar' : 'aboveBar',
              color: t.status === 'WIN' ? '#4ade80' : '#ef4444',
              shape: t.status === 'WIN' ? 'arrowUp' : 'arrowDown',
              text: t.status === 'WIN' ? 'WIN' : 'LOSS',
          }));
          markers.sort((a,b) => a.time - b.time);
          candleSeriesRef.current.setMarkers(markers);
      }
  }, [tradeHistory]);

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

  useEffect(() => {
    if (!chartContainerRef.current || chartInstanceRef.current) return;
    const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#A1A1AA', fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
        width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight,
        localization: { timeFormatter: formatHKTime, dateFormat: 'yyyy-MM-dd' },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#27272a', rightOffset: 12, barSpacing: 10, fixLeftEdge: true, tickMarkFormatter: formatHKTime },
        rightPriceScale: { borderColor: '#27272a', scaleMargins: { top: 0.1, bottom: 0.2 }, autoScale: true },
    });
    chartInstanceRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', color: '#eab308' });
    volumeSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    emaSeriesRef.current = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1, crosshairMarkerVisible: false, title: 'EMA(20)' });

    const initDataStream = async () => {
        try {
            const res = await fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=500');
            const raw = await res.json();
            const hist = raw.map(d => ({ time: d[0]/1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
            candlesRef.current = hist;
            candleSeriesRef.current.setData(hist);
            volumeSeriesRef.current.setData(hist.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)' })));
            const emaData = calculateEMA(hist.map(d=>d.close), STRATEGY.EMA_PERIOD);
            emaSeriesRef.current.setData(hist.map((d,i)=>({time:d.time, value:emaData[i]})).filter(d=>d.value!=null));
            updateSupportResistance(candleSeriesRef.current, hist);
            setConnectionStatus('ONLINE');

            const ws = new WebSocket('wss://stream.binance.com:9443/ws/paxgusdt@kline_1m');
            ws.onmessage = (e) => {
                const k = JSON.parse(e.data).k;
                const candle = { time: k.t/1000, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v) };
                if (candleSeriesRef.current) candleSeriesRef.current.update(candle);
                if (volumeSeriesRef.current) volumeSeriesRef.current.update({ time: candle.time, value: candle.volume, color: candle.close>=candle.open?'rgba(34, 197, 94, 0.5)':'rgba(239, 68, 68, 0.5)'});

                let h = candlesRef.current;
                let ch = [...h];
                if (ch[ch.length-1] && ch[ch.length-1].time===candle.time) ch[ch.length-1]=candle; else ch.push(candle);
                
                const closes = ch.map(c=>c.close);
                const fullEMA = calculateEMA(closes, STRATEGY.EMA_PERIOD);
                const curEMA = fullEMA[fullEMA.length-1];
                if (curEMA) emaSeriesRef.current.update({time:candle.time, value:curEMA});

                const srLevels = updateSupportResistance(candleSeriesRef.current, ch);

                const rsi = calculateRSI(closes, STRATEGY.RSI_PERIOD);
                const volSMA = calculateSMA(h.map(c=>c.volume), STRATEGY.VOL_MA_PERIOD);
                const volFactor = (candle.volume/(volSMA||1)).toFixed(2);
                const macd = calculateMACD(closes, STRATEGY.MACD_FAST, STRATEGY.MACD_SLOW, STRATEGY.MACD_SIGNAL);
                const atr = calculateATR(ch.map(c=>c.high), ch.map(c=>c.low), closes, STRATEGY.ATR_PERIOD);

                setMarketData({ price: candle.close, rsi: rsi.toFixed(1), volFactor, ema: curEMA?curEMA.toFixed(2):0, macdHist: macd.hist, atr, support: srLevels?.low, resistance: srLevels?.high });

                if (activeSignalRef.current) {
                    const signal = activeSignalRef.current;
                    const elapsedMin = (Date.now() - signal.timestamp) / 60000;
                    if (candle.high >= signal.tp) {
                        const result = { ...signal, status: 'WIN', exitPrice: signal.tp, exitTime: formatHKTime(candle.time), entryTimeRaw: signal.entryTimeRaw };
                        setTradeHistory(prev => [result, ...prev]);
                        setActiveSignal(null);
                        activeSignalRef.current = null;
                    } else if (candle.low <= signal.sl) {
                        const result = { ...signal, status: 'LOSS', exitPrice: signal.sl, exitTime: formatHKTime(candle.time), entryTimeRaw: signal.entryTimeRaw };
                        setTradeHistory(prev => [result, ...prev]);
                        setActiveSignal(null);
                        activeSignalRef.current = null;
                    } else if (elapsedMin > 15) {
                        setActiveSignal(null);
                        activeSignalRef.current = null;
                    }
                }

                // [V18.0] Precision Entry Logic
                const dist = (candle.close - curEMA)/curEMA*100;
                let tip = "監測中...", setup = null;
                const calcSize = (entry, stop) => {
                    const riskAmt = capital * (riskPct / 100);
                    const riskPerShare = Math.abs(entry - stop);
                    if(riskPerShare === 0) return 0;
                    const riskBasedSize = riskAmt / riskPerShare;
                    const walletBasedSize = (capital * leverage) / entry;
                    return Math.min(riskBasedSize, walletBasedSize).toFixed(4);
                };

                const dynamicStop = Math.max(curEMA, srLevels?.low || curEMA - atr) - 0.5;
                const dynamicTarget = (srLevels?.high > candle.close ? srLevels.high : candle.close + atr * 3).toFixed(2);
                
                // Smart Entry Point: a slight pullback or the EMA line
                const limitEntry = Math.min(candle.close, curEMA + atr * 0.1); 

                if (rsi > 80) tip = "⚠️ 危險：RSI 超買！";
                else if (candle.close < curEMA) tip = "📉 跌勢：忍手。";
                else if (dist > 0.15 && candle.volume < volSMA * STRATEGY.VOL_MULTIPLIER) {
                    tip = `✋ 升過龍：等回調到 EMA (${curEMA.toFixed(2)})`;
                } else {
                    tip = `🎯 黃金位：準備掛單！`;
                    setup = { type: 'LIMIT BUY', entry: limitEntry.toFixed(2), target: dynamicTarget, stop: dynamicStop.toFixed(2), size: calcSize(limitEntry, dynamicStop) };
                }
                setStrategyTip(tip);
                setTradeSetup(setup);

                if (k.x) {
                    h.push(candle); if (h.length>500) h.shift(); candlesRef.current=h;
                    if (!activeSignalRef.current && rsi>STRATEGY.RSI_THRESHOLD && rsi<STRATEGY.RSI_OVERBOUGHT && candle.volume>volSMA*STRATEGY.VOL_MULTIPLIER && macd.hist>0) {
                        const newSignal = { 
                            type: '🚀 爆升突破', variant: 'success', price: candle.close, time: formatHKTime(candle.time), reason: `Vol ${volFactor}x`,
                            tp: parseFloat(dynamicTarget), sl: parseFloat(dynamicStop.toFixed(2)), timestamp: Date.now(), entryTimeRaw: candle.time
                        };
                        setActiveSignal(newSignal);
                        activeSignalRef.current = newSignal;
                    }
                }
            };
            return ws;
        } catch (e) { setConnectionStatus('Err'); }
    };
    const wsPromise = initDataStream();
    const ro = new ResizeObserver(e => { if(e[0].contentRect) { chart.applyOptions({width:e[0].contentRect.width, height:e[0].contentRect.height}); setTimeout(()=>chart.timeScale().fitContent(),0); }});
    ro.observe(chartContainerRef.current);
    return () => { wsPromise.then(w=>w&&w.close()); chart.remove(); ro.disconnect(); chartInstanceRef.current=null; };
  }, [capital, riskPct, leverage]);

  const rsiStat = (r) => r>=80 ? {c:'#ef4444',t:'⚠️ 危險'} : (r>=55 ? {c:'#4ade80',t:'🚀 強勢'} : {c:'#94a3b8',t:'⚪ 弱勢'});
  const rs = rsiStat(marketData.rsi);
  const riskAmt = (capital * (riskPct/100)).toFixed(0);
  const buyingPower = (capital * leverage).toFixed(0); 

  const filteredHistory = tradeHistory.filter(t => {
      if (filterMode === 'preset') {
          if (presetPeriod === 0) return true;
          const elapsedMin = (Date.now() - t.timestamp) / (1000 * 60);
          return elapsedMin <= presetPeriod;
      } else {
          return t.timestamp >= customRange.start && t.timestamp <= customRange.end;
      }
  });

  const wins = filteredHistory.filter(t => t.status === 'WIN').length;
  const losses = filteredHistory.filter(t => t.status === 'LOSS').length;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

  const presets = [
      { label: '30M', val: 30 }, { label: '1H', val: 60 }, { label: '4H', val: 240 },
      { label: '1D', val: 1440 }, { label: '1W', val: 10080 }, { label: '1M', val: 43200 }, { label: 'All', val: 0 }
  ];

  return (
    <div style={styles.container}>
      <style>{`html,body,#root{margin:0;padding:0;width:100%;height:100%;background:#09090b;overflow:hidden}.pulse{animation:pulse 2s infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,0.7)}70%{box-shadow:0 0 0 10px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}`}</style>
      
      <div style={styles.header}>
        <div style={styles.statusDot} className={connectionStatus==='ONLINE'?'pulse':''}></div>
        <div style={{flexGrow:1}}>
            <h1 style={styles.title}>JINGUO SCALPER <span style={styles.proBadge}>V18.0</span></h1>
            <p style={styles.subtitle}>PAXG/USDT • 1M • {connectionStatus}</p>
        </div>
        
        <div style={{display:'flex', gap:'10px', marginRight:'15px', alignItems:'center'}}>
             <div onClick={()=>setShowHistory(!showHistory)} style={{cursor:'pointer', background:'#27272a', padding:'5px 15px', borderRadius:'4px', border:'1px solid #3f3f46', fontSize:'0.9rem', color:'#fff'}}>
                 <span style={{color:'#94a3b8', marginRight:'5px'}}>
                     {filterMode==='preset' ? (presets.find(p=>p.val===presetPeriod)?.label + ' Result:') : 'Custom Result:'}
                 </span>
                 <span style={{color:winRate>=50?'#4ade80':'#ef4444', fontWeight:'bold'}}>{winRate}% ({wins}W-{losses}L)</span>
             </div>
        </div>
        <button onClick={()=>setShowSettings(!showSettings)} style={styles.settingsBtn}>⚙️</button>
      </div>

      {showSettings && (
          <div style={styles.settingsPanel}>
              <div style={{display:'flex', gap:'15px', alignItems:'center', flexWrap:'wrap'}}>
                  <label>本金: <input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value))} style={styles.input} /></label>
                  <label>Risk%: <input type="number" value={riskPct} onChange={e=>setRiskPct(Number(e.target.value))} style={styles.input} /></label>
                  <label>槓桿(x): <input type="number" value={leverage} onChange={e=>setLeverage(Number(e.target.value))} style={styles.input} /></label>
                  <span style={{color:'#ef4444', fontWeight:'bold', fontSize:'0.8rem'}}>Risk: -${riskAmt}</span>
                  <span style={{color:'#3b82f6', fontWeight:'bold', fontSize:'0.8rem'}}>Power: ${buyingPower}</span>
              </div>
          </div>
      )}

      {showHistory && (
          <div style={styles.historyPanel}>
              <div style={{borderBottom:'1px solid #3f3f46', paddingBottom:'10px', marginBottom:'10px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                      <strong>交易記錄</strong>
                      <button onClick={()=>setFilterMode(filterMode==='preset'?'custom':'preset')} style={styles.toggleBtn}>
                          {filterMode==='preset' ? '切換自定義' : '切換預設'}
                      </button>
                  </div>
                  {filterMode === 'preset' ? (
                      <div style={{display:'flex', gap:'5px', flexWrap:'wrap'}}>
                          {presets.map(p => (
                              <button key={p.label} onClick={()=>setPresetPeriod(p.val)} 
                                  style={presetPeriod===p.val?styles.filterBtnActive:styles.filterBtn}>
                                  {p.label}
                              </button>
                          ))}
                      </div>
                  ) : (
                      <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                              <span style={{fontSize:'0.8rem', color:'#94a3b8'}}>From:</span>
                              <input type="datetime-local" style={styles.dateInput} 
                                  value={toInputFormat(customRange.start)}
                                  onChange={e=>setCustomRange({...customRange, start: new Date(e.target.value).getTime()})} />
                          </div>
                          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                              <span style={{fontSize:'0.8rem', color:'#94a3b8'}}>To:</span>
                              <input type="datetime-local" style={styles.dateInput}
                                  value={toInputFormat(customRange.end)}
                                  onChange={e=>setCustomRange({...customRange, end: new Date(e.target.value).getTime()})} />
                          </div>
                      </div>
                  )}
              </div>
              <div style={{maxHeight:'300px', overflowY:'auto'}}>
                  {filteredHistory.length === 0 ? <div style={{color:'#71717a', textAlign:'center', padding:'20px'}}>暫無記錄</div> : 
                   filteredHistory.map((t, i) => (
                      <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:'0.85rem', padding:'8px 0', borderBottom:'1px solid #27272a'}}>
                          <div>
                              <span style={{color:t.status==='WIN'?'#4ade80':'#ef4444', fontWeight:'bold', marginRight:'10px'}}>{t.status}</span>
                              <span style={{color:'#94a3b8'}}>{t.time}</span>
                          </div>
                          <div style={{textAlign:'right'}}>
                              <div style={{color:'#fff'}}>Entry: {t.price}</div>
                              <div style={{color:'#71717a', fontSize:'0.75rem'}}>Exit: {t.exitPrice}</div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      <div style={styles.grid}>
        <StatCard label="現價" value={marketData.price.toFixed(2)} unit="$" color="#FFFFFF" isMain={true} />
        <StatCard label="支撐 (Low 50)" value={marketData.support?.toFixed(2) || "---"} unit="$" color="#22c55e" sub="Support" />
        <StatCard label="阻力 (High 50)" value={marketData.resistance?.toFixed(2) || "---"} unit="$" color="#ef4444" sub="Resist" />
        <StatCard label="成交倍數" value={marketData.volFactor || "0.00"} unit="x" color={parseFloat(marketData.volFactor)>1.5?'#4ade80':'#94a3b8'} sub={parseFloat(marketData.volFactor)>1.5?"🚀 爆量":"💤 縮量"} />
        <StatCard label="EMA (20)" value={marketData.ema || 0} unit="$" color="#fbbf24" sub="Trend" />
      </div>

      {activeSignal && (
        <div style={{...styles.alertBox, background: '#4ade80'}}>
            <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                <span style={{fontSize: '1.5rem'}}>🚀</span>
                <div style={{flexGrow:1}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <strong style={{fontSize:'1.1rem',color:'#000'}}>ACTIVE TRADE: {activeSignal.price}</strong>
                        <button onClick={()=>{setActiveSignal(null); activeSignalRef.current=null;}} style={styles.closeBtn}>✕</button>
                    </div>
                    <div style={{marginTop:'5px', paddingTop:'5px', borderTop:'1px solid rgba(0,0,0,0.1)', display:'flex', gap:'15px', fontSize:'0.95rem', color:'#000', fontWeight:'bold'}}>
                             <span>🎯 TP: {activeSignal.tp}</span>
                             <span>🛑 SL: {activeSignal.sl}</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div style={{display:'flex', gap:'10px', marginBottom:'15px', alignItems:'stretch'}}>
          <div style={styles.tipBar}><span>💡 教練:</span> <span style={{color:'#fff',fontWeight:'bold',marginLeft:'5px'}}>{strategyTip}</span></div>
          {tradeSetup && (
             <div style={styles.setupBox}>
                 <div style={{fontSize:'0.7rem', color:'#94a3b8', marginBottom:'5px', display:'flex', justifyContent:'space-between'}}>
                     <span>建議部署 ({tradeSetup.type})</span>
                     <span style={{color:'#ef4444'}}>Risk: ${riskAmt}</span>
                 </div>
                 <div style={{display:'flex', gap:'15px', fontSize:'0.9rem', fontWeight:'bold', alignItems:'center'}}>
                     <span style={{color:'#fff', background:'#27272a', padding:'2px 6px', borderRadius:'4px'}}>🛒 買 {tradeSetup.size} 股</span>
                     <span style={{color:'#3b82f6'}}>@ {tradeSetup.entry}</span>
                     <span style={{color:'#4ade80'}}>🎯 {tradeSetup.target}</span>
                     <span style={{color:'#ef4444'}}>🛑 {tradeSetup.stop}</span>
                 </div>
             </div>
          )}
      </div>

      <div style={styles.chartWrapper}><div ref={chartContainerRef} style={styles.chartContainer} /></div>
    </div>
  );
}

const styles = {
    container: { padding:'20px', background:'#09090b', color:'#f4f4f5', height:'100vh', width:'100vw', boxSizing:'border-box', fontFamily:"'Roboto Mono', sans-serif", display:'flex', flexDirection:'column' },
    header: { display:'flex', alignItems:'center', gap:'15px', marginBottom:'15px', borderBottom:'2px solid #27272a', paddingBottom:'15px', flexShrink:0 },
    statusDot: { width:'12px', height:'12px', background:'#4ade80', borderRadius:'50%' },
    title: { fontSize:'1.5rem', fontWeight:'700', margin:0 },
    proBadge: { background:'#facc15', color:'#000', fontSize:'0.7rem', padding:'2px 6px', borderRadius:'4px', verticalAlign:'top', fontWeight:'bold', marginLeft:'8px' },
    subtitle: { fontSize:'0.8rem', color:'#71717a', margin:'4px 0 0 0' },
    settingsBtn: { background:'#27272a', color:'#fff', border:'none', padding:'8px 15px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold' },
    settingsPanel: { background:'#18181b', padding:'15px', borderRadius:'8px', marginBottom:'15px', border:'1px solid #3f3f46' },
    input: { background:'#000', border:'1px solid #3f3f46', color:'#fff', padding:'5px', borderRadius:'4px', marginLeft:'5px', width:'60px' },
    grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:'15px', marginBottom:'15px', flexShrink:0 },
    alertBox: { padding:'15px 20px', borderRadius:'8px', marginBottom:'15px', fontWeight:'bold', width:'100%', boxSizing:'border-box', flexShrink:0 },
    tipBar: { background:'#1e293b', borderLeft:'4px solid #3b82f6', padding:'10px 15px', borderRadius:'4px', fontSize:'0.9rem', color:'#94a3b8', flexGrow:1, display:'flex', alignItems:'center' },
    setupBox: { background:'#18181b', border:'1px solid #27272a', borderRadius:'4px', padding:'10px 15px', flexGrow:1.5 },
    chartWrapper: { flexGrow:1, width:'100%', position:'relative', background:'#000', border:'2px solid #27272a', borderRadius:'8px', overflow:'hidden' },
    chartContainer: { width:'100%', height:'100%' },
    closeBtn: { background:'rgba(0,0,0,0.2)', border:'none', cursor:'pointer', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold'},
    historyPanel: { position:'absolute', top:'80px', right:'20px', width:'320px', background:'#18181b', border:'1px solid #3f3f46', borderRadius:'8px', padding:'15px', zIndex:100, boxShadow:'0 10px 25px rgba(0,0,0,0.5)'},
    filterBtn: { background:'transparent', color:'#71717a', border:'1px solid #27272a', cursor:'pointer', fontSize:'0.75rem', borderRadius:'4px', padding:'4px 8px', minWidth:'40px' },
    filterBtnActive: { background:'#3b82f6', color:'#fff', border:'1px solid #3b82f6', cursor:'pointer', fontSize:'0.75rem', borderRadius:'4px', padding:'4px 8px', minWidth:'40px', fontWeight:'bold' },
    toggleBtn: { background:'transparent', color:'#3b82f6', border:'none', cursor:'pointer', fontSize:'0.8rem', textDecoration:'underline' },
    dateInput: { background:'#000', border:'1px solid #3f3f46', color:'#fff', padding:'5px', borderRadius:'4px', fontSize:'0.8rem' }
};

function StatCard({ label, value, unit, color, sub, isMain }) {
    return (
        <div style={{ background: '#18181b', padding: '15px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '5px' }}>{label}</div>
            <div style={{ fontSize: isMain ? '2rem' : '1.5rem', fontWeight: '700', color: color, fontFamily: "'Roboto Mono', monospace" }}>{unit==='$'?unit:''}{value}{unit==='x'?unit:''}<span style={{fontSize:'0.8rem', color: color, marginLeft:'5px', fontWeight:'normal', opacity:0.8}}>{sub}</span></div>
        </div>
    );
}
