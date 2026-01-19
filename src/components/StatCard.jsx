import React from "react";

export default function StatCard({ label, value, unit, color, className }) {
  return (
    <div className={className}>
      {" "}
      {/* 這裡必須接收 className */}
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color }}>
        {unit === "$" ? unit : ""}
        {value}
      </div>
    </div>
  );
}
