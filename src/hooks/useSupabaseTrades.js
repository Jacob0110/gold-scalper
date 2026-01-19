import { useState, useEffect, useCallback } from "react";
import { CONFIG } from "../config";

// 初始化或取得 Supabase Client 的 Helper
const getSupabaseClient = () => {
  // Mock 機制：防止 SSR 或無 window 環境報錯，或當 Config 未設定時不讓程式崩潰
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

  const { createClient } = window.supabase || { createClient: () => null };
  return window.supabase
    ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
    : null;
};

export const useSupabaseTrades = () => {
  const [liveHistory, setLiveHistory] = useState([]);
  const [supabase] = useState(getSupabaseClient()); // 初始化一次，保持實例穩定

  // 格式化數據的 Helper
  const mapTradeData = (d) => ({
    id: d.id,
    status: d.status,
    price: d.entry_price,
    exitPrice: d.exit_price,
    exitTime: d.exit_time
      ? new Date(d.exit_time).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-",
    time: new Date(d.entry_time).toLocaleString("en-GB", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    entryTimeRaw: new Date(d.entry_time).getTime() / 1000,
    timestamp: new Date(d.entry_time).getTime(),
  });

  useEffect(() => {
    if (!supabase) return;

    // 1. 載入初始歷史記錄 (最近 30 天)
    const loadInitial = async () => {
      const since = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .gte("entry_time", since)
        .order("entry_time", { ascending: false });

      if (error) console.error("Error loading trades:", error);
      if (data) {
        setLiveHistory(data.map(mapTradeData));
      }
    };

    loadInitial();

    // 2. 建立即時監聽 (Realtime Subscription)
    const channel = supabase
      .channel("trades_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        (payload) => {
          const newTrade = mapTradeData(payload.new);
          setLiveHistory((prev) => [newTrade, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // ✅ 關鍵修正：使用 useCallback 包裹，防止函數重建導致 App.jsx 的 Effect 重跑
  const recordTrade = useCallback(
    async (signal, status, exitPrice, candleTime) => {
      if (!supabase) return;
      try {
        await supabase.from("trades").insert({
          type: signal.type,
          status,
          entry_price: signal.price,
          exit_price: exitPrice,
          tp: signal.tp,
          sl: signal.sl,
          entry_time: new Date(signal.timestamp).toISOString(),
          exit_time: new Date(candleTime * 1000).toISOString(),
        });
      } catch (e) {
        console.error("Failed to record trade:", e);
      }
    },
    [supabase]
  ); // 依賴 supabase (它不會變)

  // ✅ 關鍵修正：使用 useCallback 包裹
  const clearHistory = useCallback(async () => {
    if (!supabase) return;
    if (!window.confirm("清空所有 live 記錄?")) return;
    try {
      await supabase.from("trades").delete().neq("id", 0);
      setLiveHistory([]);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  }, [supabase]);

  return {
    supabase,
    liveHistory,
    setLiveHistory,
    recordTrade,
    clearHistory,
  };
};
