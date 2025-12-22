// src/config.js
export const CONFIG = {
  // Supabase Credentials
  SUPABASE_URL: 'https://iiteqpbtsssvrlpuxppj.supabase.co',      // 把你的 URL 填在這裡
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdGVxcGJ0c3NzdnJscHV4cHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTYzMTgsImV4cCI6MjA4MDkzMjMxOH0.fzHqf_kiP7Ba8A7q4zo4hL4I4nILXX-imAhatZZdS1k', // 把你的 KEY 填在這裡
  
  DEFAULT_ZOOM_HOURS: 0.5,
  STRATEGY: {
    EMA_FAST: 20,
    JINGUO_BODY_SIZE: 0.1,
    RETRACE_RATIO: 0.3,
    RISK_REWARD: 2.0,
    VOL_MULTIPLIER: 0.8,
    RSI_MIN: 20,
    RSI_MAX: 90,
    RSI_PERIOD: 14,
    VOL_MA_PERIOD: 20,
    EMA_SLOW: 50,
    ADX_PERIOD: 14,
    ATR_PERIOD: 14,
    LOOKBACK_PERIOD: 50
  }

};
