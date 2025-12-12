// src/config.js
export const CONFIG = {
  // Supabase Credentials
  SUPABASE_URL: 'https://iiteqpbtsssvrlpuxppj.supabase.co',      // 把你的 URL 填在這裡
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdGVxcGJ0c3NzdnJscHV4cHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTYzMTgsImV4cCI6MjA4MDkzMjMxOH0.fzHqf_kiP7Ba8A7q4zo4hL4I4nILXX-imAhatZZdS1k', // 把你的 KEY 填在這裡

  // Trading Strategy Settings (也可以放這裡方便統一管理)
   STRATEGY: {
    // 基礎指標
    RSI_PERIOD: 14, 
    VOL_MA_PERIOD: 20, 
    EMA_PERIOD: 20,
    MACD_FAST: 12, MACD_SLOW: 26, MACD_SIGNAL: 9, 
    ATR_PERIOD: 14,
    
    // [V28.0] 金果流專用參數
    JINGUO_BODY_SIZE: 0.8,   // K線實體必須大於 0.8倍 ATR (過濾小波動)
    RETRACE_RATIO: 0.5,      // 掛單在 K 線實體的 50% 位置 (0.5)
    RISK_REWARD: 1.5,        // 盈虧比 1:1.5
    DEFAULT_ZOOM_HOURS: 1,   // 預設看 1 小時
    
    // 過濾條件
    RSI_MIN: 45,             // RSI 不能太低 (趨勢要夠強)
    RSI_MAX: 75,             // RSI 不能太高 (避免山頂)
    VOL_MULTIPLIER: 1.2      // 成交量要大於平均的 1.2 倍
  }

  
};
