import { CONFIG } from "../config";

// 初始化 Mock (如果需要)
export const initSupabaseMock = () => {
  if (typeof window !== "undefined" && !window.supabase) {
    window.supabase = {
      createClient: () => ({
        from: () => ({
          select: () => Promise.resolve({ data: [] }),
          delete: () => Promise.resolve({}),
          insert: (data) => Promise.resolve({ data }),
          gte: () => ({}),
          order: () => ({}),
          neq: () => ({}),
        }),
        channel: () => ({
          on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        }),
        removeChannel: () => {},
      }),
    };
  }
};

// 取得 Client
export const getSupabaseClient = () => {
  initSupabaseMock();
  const { createClient } = window.supabase || { createClient: () => null };
  return window.supabase
    ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
    : null;
};
