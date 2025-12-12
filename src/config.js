// src/config.js
export const CONFIG = {
  // Supabase Credentials
  SUPABASE_URL: 'https://iiteqpbtsssvrlpuxppj.supabase.co',      // 把你的 URL 填在這裡
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdGVxcGJ0c3NzdnJscHV4cHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTYzMTgsImV4cCI6MjA4MDkzMjMxOH0.fzHqf_kiP7Ba8A7q4zo4hL4I4nILXX-imAhatZZdS1k', // 把你的 KEY 填在這裡
  
  DEFAULT_ZOOM_HOURS: 0.5,
  // Trading Strategy Settings (也可以放這裡方便統一管理)
   STRATEGY: {
    // 基礎參數
    RSI_PERIOD: 14, 
    VOL_MA_PERIOD: 20, 
    EMA_FAST: 20,
    EMA_SLOW: 50, 
    ADX_PERIOD: 14, 

    // [V31.0] 極度放寬測試 (先讓它能開單，再收緊)
    ADX_THRESHOLD: 0,      // 關閉 ADX
    JINGUO_BODY_SIZE: 0.3, // [Ultra Relaxed] 只要實體大於 0.3 ATR 就視為有效
    RETRACE_RATIO: 0.3,    // [Adjusted] 回調 30% 就進場 (比較容易成交)
    RISK_REWARD: 1.5,      
    
    RSI_MIN: 35,           // [Widened] 放寬
    RSI_MAX: 85,             
    VOL_MULTIPLIER: 1.05   // [Relaxed] 只要比平均量大一點點
  }
};
