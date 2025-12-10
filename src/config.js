// src/config.js
export const CONFIG = {
  // Supabase Credentials
  SUPABASE_URL: 'https://iiteqpbtsssvrlpuxppj.supabase.co',      // 把你的 URL 填在這裡
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdGVxcGJ0c3NzdnJscHV4cHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTYzMTgsImV4cCI6MjA4MDkzMjMxOH0.fzHqf_kiP7Ba8A7q4zo4hL4I4nILXX-imAhatZZdS1k', // 把你的 KEY 填在這裡

  // Trading Strategy Settings (也可以放這裡方便統一管理)
  STRATEGY: {
    RSI_PERIOD: 14, 
    VOL_MA_PERIOD: 20, 
    EMA_PERIOD: 20,
    MACD_FAST: 12, 
    MACD_SLOW: 26, 
    MACD_SIGNAL: 9, 
    RSI_THRESHOLD: 55, 
    RSI_OVERBOUGHT: 80, 
    VOL_MULTIPLIER: 1.5, 
    ATR_PERIOD: 14,
    LOOKBACK_PERIOD: 50,
    ENTRY_PULLBACK: 0.02,

    DEFAULT_ZOOM_HOURS: 1
  }

  
};
