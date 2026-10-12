export default function MetricsBox({ metrics }) {
  const items = [
    { label: "MAE", value: metrics.mae_norm != null ? metrics.mae_norm.toFixed(4) : "—" },
    { label: "PCK@10%", value: metrics.pck10 != null ? `${metrics.pck10}%` : "—" },
    { label: "FPS", value: metrics.fps != null ? metrics.fps : "—" },
  ];
  return (
    <div className="metrics-box">
      <h3>Model Accuracy</h3>
      <div className="metrics-grid">
        {items.map((m) => (
          <div className="metric" key={m.label}>
            <div className="value">{m.value}</div>
            <div className="label">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
