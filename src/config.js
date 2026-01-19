// src/config.js
export const CONFIG = {
  // Supabase Credentials
  SUPABASE_URL: "https://iiteqpbtsssvrlpuxppj.supabase.co",
  SUPABASE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdGVxcGJ0c3NzdnJscHV4cHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNTYzMTgsImV4cCI6MjA4MDkzMjMxOH0.fzHqf_kiP7Ba8A7q4zo4hL4I4nILXX-imAhatZZdS1k",

  // 回測時間 (你可以隨時改)
  BACKTEST_PERIOD_HOURS: 24,
  DEFAULT_ZOOM_HOURS: 0.5,
};

export const STRATEGY = {
  EMA_FAST: 20, // 舊設定: 20
  EMA_SLOW: 50, // 舊設定: 50
  JINGUO_BODY_SIZE: 0.1, // 舊設定: 0.1 (可能用於過濾太小的K線)
  RETRACE_RATIO: 0.3, // 舊設定: 0.3 (回調 30% 入場)
  RISK_REWARD: 2.0, // 舊設定: 2.0
  VOL_MULTIPLIER: 0.8,
  RSI_MIN: 20,
  RSI_MAX: 90,
  RSI_PERIOD: 14,
  VOL_MA_PERIOD: 20,
  ADX_PERIOD: 14,
  ATR_PERIOD: 14,
  LOOKBACK_PERIOD: 50,
  SL_ATR_MULT: 1.5, // 雖然舊 config 無寫，但邏輯通常需要，暫設 1.5
};

// ... initSupabaseMock 保持不變 ...
export const initSupabaseMock = () => {
  if (typeof window !== "undefined" && !window.supabase) {
    window.supabase = {
      createClient: () => ({
        from: (table) => ({
          select: () => Promise.resolve({ data: [] }),
          delete: () => Promise.resolve({}),
          insert: (data) => Promise.resolve({ data }),
          gte: (field, value) => ({}),
          order: (field, options) => ({}),
          neq: (field, value) => ({}),
        }),
        channel: (name) => ({
          on: (event, schema, table, callback) => ({
            subscribe: () => ({
              unsubscribe: () => {},
            }),
          }),
        }),
        removeChannel: (channel) => {},
      }),
    };
  }
};
