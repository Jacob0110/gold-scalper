import React, { useState } from "react";
import { toInputFormat } from "../utils/formatters";

export default function HistoryPanel({
  historyMode,
  setHistoryMode,
  historySource,
  runSupabaseBacktest,
  supabaseBtResult,
  showHistory,
  setShowHistory,
  isMobile,
}) {
  const [filterMode, setFilterMode] = useState("preset");
  const [presetPeriod, setPresetPeriod] = useState(0);
  const [customRange, setCustomRange] = useState({
    start: Date.now() - 86400000,
    end: Date.now(),
  });

  const styles = {
    historyPanel: {
      position: "absolute",
      top: isMobile ? 60 : 70,
      right: isMobile ? 10 : 20,
      bottom: isMobile ? 10 : 20,
      width: isMobile ? "calc(100% - 20px)" : 420,
      background: "#18181b",
      border: "1px solid #3f3f46",
      borderRadius: 8,
      padding: 15,
      // ⬇️⬇️⬇️ 關鍵修正：確保 zIndex 足夠大，並且設定 pointerEvents ⬇️⬇️⬇️
      zIndex: 9999,
      pointerEvents: "auto",
      // ⬆️⬆️⬆️ ----------------------------------------------------- ⬆️⬆️⬆️
      boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
      display: "flex",
      flexDirection: "column",
    },
    // ... 其他 styles 保持不變
    filterBtn: {
      background: "transparent",
      color: "#71717a",
      border: "1px solid #27272a",
      cursor: "pointer",
      fontSize: "0.75rem",
      borderRadius: 4,
      padding: "6px 10px",
      minWidth: 40,
    },
    filterBtnActive: {
      background: "#3b82f6",
      color: "#fff",
      border: "1px solid #3b82f6",
      cursor: "pointer",
      fontSize: "0.75rem",
      borderRadius: 4,
      padding: "6px 10px",
      minWidth: 40,
      fontWeight: "bold",
    },
    toggleBtn: {
      background: "transparent",
      color: "#3b82f6",
      border: "none",
      cursor: "pointer",
      fontSize: "0.8rem",
      textDecoration: "underline",
    },
    dateInput: {
      background: "#000",
      border: "1px solid #3f3f46",
      color: "#fff",
      padding: 8,
      borderRadius: 4,
      fontSize: "0.9rem",
      width: "100%",
      boxSizing: "border-box",
    },
  };

  const filteredHistory = historySource.filter((t) => {
    if (!t.timestamp) return false;
    if (filterMode === "preset") {
      if (presetPeriod === 0) return true;
      const elapsedMin = (Date.now() - t.timestamp) / 60000;
      return elapsedMin >= -1 && elapsedMin <= presetPeriod;
    }
    return t.timestamp >= customRange.start && t.timestamp <= customRange.end;
  });

  const wins = filteredHistory.filter((t) => t.status === "WIN").length;
  const losses = filteredHistory.filter((t) => t.status === "LOSS").length;
  const winRate =
    wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

  const presets = [
    { label: "1H", val: 60 },
    { label: "4H", val: 240 },
    { label: "24H", val: 1440 },
    { label: "All", val: 0 },
  ];

  if (!showHistory) return null;

  return (
    <div style={styles.historyPanel}>
      <div
        style={{
          borderBottom: "1px solid #3f3f46",
          paddingBottom: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <strong>
            交易記錄 ({historyMode === "live" ? "LIVE" : "BACKTEST"}) (
            {filteredHistory.length})
          </strong>

          <div style={{ display: "flex", gap: 5 }}>
            <button
              onClick={() => setHistoryMode("live")}
              style={
                historyMode === "live"
                  ? styles.filterBtnActive
                  : styles.filterBtn
              }
            >
              Live
            </button>
            <button
              onClick={() => setHistoryMode("backtest")}
              style={
                historyMode === "backtest"
                  ? styles.filterBtnActive
                  : styles.filterBtn
              }
            >
              Backtest
            </button>
            <button onClick={runSupabaseBacktest} style={styles.filterBtn}>
              Supabase
            </button>
          </div>
        </div>

        <button
          onClick={() =>
            setFilterMode(filterMode === "preset" ? "custom" : "preset")
          }
          style={styles.toggleBtn}
        >
          {filterMode === "preset" ? "自定義時間" : "預設時間段"}
        </button>

        {filterMode === "preset" ? (
          <div
            style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}
          >
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setPresetPeriod(p.val)}
                style={
                  presetPeriod === p.val
                    ? styles.filterBtnActive
                    : styles.filterBtn
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              marginTop: 5,
            }}
          >
            <input
              type="datetime-local"
              style={styles.dateInput}
              value={toInputFormat(customRange.start)}
              onChange={(e) =>
                setCustomRange({
                  ...customRange,
                  start: new Date(e.target.value).getTime(),
                })
              }
            />
            <input
              type="datetime-local"
              style={styles.dateInput}
              value={toInputFormat(customRange.end)}
              onChange={(e) =>
                setCustomRange({
                  ...customRange,
                  end: new Date(e.target.value).getTime(),
                })
              }
            />
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredHistory.map((t, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              padding: "10px 0",
              borderBottom: "1px solid #27272a",
            }}
          >
            <div>
              <span
                style={{
                  color: t.status === "WIN" ? "#4ade80" : "#ef4444",
                  fontWeight: "bold",
                  marginRight: 10,
                }}
              >
                {t.status}
              </span>
              <span style={{ color: "#94a3b8" }}>{t.time}</span>
              {historyMode === "backtest" && (
                <div
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.75rem",
                    marginTop: 2,
                  }}
                >
                  Size: {t.size} · PnL:{" "}
                  <span
                    style={{
                      color: parseFloat(t.profit) >= 0 ? "#4ade80" : "#ef4444",
                      fontWeight: "bold",
                    }}
                  >
                    {parseFloat(t.profit) >= 0 ? "+" : ""}
                    {t.profit}
                  </span>{" "}
                  · Bal: ${t.balanceAfter}
                </div>
              )}
              {/* Supabase Result Summary Block */}
              {supabaseBtResult && i === 0 && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: "0.8rem",
                    color: "#e5e7eb",
                    border: "1px dashed #3f3f46",
                    padding: 5,
                  }}
                >
                  <div>
                    Total: {supabaseBtResult.totalTrades}, Win%:{" "}
                    {supabaseBtResult.winRate}%, PnL: ${supabaseBtResult.pnl}
                  </div>
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff" }}>In: {t.price}</div>
              {t.exitPrice && (
                <div style={{ color: "#71717a", fontSize: "0.8rem" }}>
                  Out: {t.exitPrice}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 關閉按鈕 */}
      <div style={{ marginTop: 10, textAlign: "center" }}>
        <button
          onClick={() => setShowHistory(false)}
          style={{
            background: "#27272a",
            color: "#fff",
            border: "none",
            padding: "5px 20px",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
