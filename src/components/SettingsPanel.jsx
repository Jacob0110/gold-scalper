import React from "react";

export default function SettingsPanel({
  capital,
  setCapital,
  riskPct,
  setRiskPct,
  leverage,
  setLeverage,
  onRunBacktest,
  clearHistory,
}) {
  const styles = {
    settingsPanel: {
      background: "#18181b",
      padding: 15,
      borderRadius: 8,
      marginBottom: 10,
      border: "1px solid #3f3f46",
    },
    input: {
      background: "#000",
      border: "1px solid #3f3f46",
      color: "#fff",
      padding: 8,
      borderRadius: 4,
      marginLeft: 5,
      width: 70,
      fontSize: "1rem",
    },
    runBtn: {
      background: "#3b82f6",
      color: "#fff",
      border: "none",
      padding: "8px 20px",
      borderRadius: 4,
      cursor: "pointer",
      fontWeight: "bold",
      fontSize: "1rem",
    },
    clearBtn: {
      background: "#ef4444",
      color: "#fff",
      border: "none",
      padding: "8px 12px",
      borderRadius: 4,
      cursor: "pointer",
      fontWeight: "bold",
    },
    row: {
      display: "flex",
      gap: 15,
      alignItems: "center",
      flexWrap: "wrap",
    },
  };

  return (
    <div style={styles.settingsPanel}>
      <div style={styles.row}>
        <label>
          本金: $
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            style={styles.input}
          />
        </label>
        <label>
          Risk:
          <input
            type="number"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            style={styles.input}
          />
          %
        </label>
        <label>
          槓桿:
          <input
            type="number"
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={styles.input}
          />
          x
        </label>

        {/* 執行回測按鈕 */}
        <button onClick={onRunBacktest} style={styles.runBtn}>
          🚀 回測 (Chart)
        </button>

        {/* 清空歷史按鈕 */}
        <button onClick={clearHistory} style={styles.clearBtn}>
          清空 live
        </button>
      </div>
    </div>
  );
}
