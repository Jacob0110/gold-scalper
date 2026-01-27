import { useState, useEffect, useCallback, useRef } from "react";
import { CONFIG } from "../config";

// 用一個模組級變數來存 Client，確保只建立一次 (Singleton)
let globalSupabaseClient = null;

const getSupabaseClient = () => {
  // 1. 如果已經有 Client，直接回傳 (解決 Multiple Instances 警告)
  if (globalSupabaseClient) return globalSupabaseClient;

  // 2. 檢查是否有 window.supabase (CDN 來源)
  if (typeof window !== "undefined" && window.supabase) {
    const { createClient } = window.supabase;
    // 建立並存起來
    globalSupabaseClient = createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY
    );
    return globalSupabaseClient;
  }

  return null;
};

export const useSupabaseTrades = () => {
  const [liveHistory, setLiveHistory] = useState([]);
  // 使用 useRef 來保持對 client 的引用，不觸發重渲染
  const supabaseRef = useRef(getSupabaseClient());
  const supabase = supabaseRef.current;

  const mapTradeData = (d) => ({
    id: d.id,
    status: d.status,
    price: d.entry_price,
    exitPrice: d.exit_price,
    positionSize: d.position_size || 0.01,
    rawPnL: d.raw_pnl ? parseFloat(d.raw_pnl).toFixed(4) : "0",
    netPnL: d.net_pnl ? parseFloat(d.net_pnl).toFixed(4) : "0",
    costCommission: d.cost_commission
      ? parseFloat(d.cost_commission).toFixed(4)
      : "0",
    costSlippage: d.cost_slippage
      ? parseFloat(d.cost_slippage).toFixed(4)
      : "0",
    totalCost: d.total_cost ? parseFloat(d.total_cost).toFixed(4) : "0",
    riskRewardRatio: d.risk_reward_ratio || "N/A",
    tp: d.tp,
    sl: d.sl,
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
      if (data) setLiveHistory(data.map(mapTradeData));
    };

    loadInitial();

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
  }, []); // 依賴為空，只執行一次

  // ✅ 核心修復：recordTrade
  const recordTrade = useCallback(
    async (signal, status, exitPrice, candleTime) => {
      if (!supabase) {
        console.error("Supabase client not initialized");
        return;
      }

      try {
        const positionSize = signal.size || 0.01;
        let rawPnL = 0,
          netPnL = 0,
          totalCost = 0,
          totalCommission = 0,
          slippage = 0;
        let riskRewardRatio = "N/A";

        // 只在有 exitPrice 時計算 PnL (Open Trade 時 exitPrice 為 null)
        if (exitPrice !== null && exitPrice !== undefined) {
          rawPnL = (exitPrice - signal.price) * positionSize;
          const entryValue = signal.price * positionSize;
          const exitValue = exitPrice * positionSize;
          const COMMISSION_RATE = 0.001;
          const SLIPPAGE_PER_TRADE = 0.5;
          totalCommission = (entryValue + exitValue) * COMMISSION_RATE;
          slippage = SLIPPAGE_PER_TRADE;
          totalCost = totalCommission + slippage;
          netPnL = rawPnL - totalCost;
          const riskAmount = Math.abs(signal.price - signal.sl);
          const rewardAmount = Math.abs(signal.tp - signal.price);
          riskRewardRatio =
            riskAmount > 0 ? (rewardAmount / riskAmount).toFixed(2) : "N/A";
        }

        const payload = {
          type: signal.type,
          status,
          entry_price: signal.price,
          exit_price: exitPrice, // Open 時為 null
          position_size: positionSize,
          raw_pnl: rawPnL.toFixed(4),
          net_pnl: netPnL.toFixed(4),
          total_cost: totalCost.toFixed(4),
          cost_commission: totalCommission.toFixed(4),
          cost_slippage: slippage,
          tp: signal.tp,
          sl: signal.sl,
          risk_reward_ratio: riskRewardRatio,
          entry_time: new Date(signal.timestamp).toISOString(),
          exit_time: new Date(candleTime * 1000).toISOString(),
        };

        console.log("Submitting Trade Payload:", payload);
        const { error } = await supabase.from("trades").insert(payload);

        if (error) {
          console.error("Supabase Write Error:", error.message, error.details);
        } else {
          console.log(`Trade [${status}] recorded successfully.`);
        }
      } catch (e) {
        console.error("System Error in recordTrade:", e);
      }
    },
    []
  );

  const clearHistory = useCallback(async () => {
    if (!supabase) return;
    if (!window.confirm("清空所有 live 記錄?")) return;
    try {
      await supabase.from("trades").delete().neq("id", 0);
      setLiveHistory([]);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  }, []);

  return { supabase, liveHistory, setLiveHistory, recordTrade, clearHistory };
};
