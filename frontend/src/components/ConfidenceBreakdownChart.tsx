import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";

type Props = {
  breakdown: Record<string, number> | null | undefined;
};

export function ConfidenceBreakdownChart({ breakdown }: Props) {
  const data = Object.entries(breakdown ?? {}).map(([key, value]) => ({
    label: key.replace(/_/g, " "),
    value,
  }));

  if (!data.length) {
    return <div className="empty-panel">Speech delivery metrics will appear after scoring.</div>;
  }

  return (
    <div className="chart-card">
      <div className="section-heading compact">
        <span className="eyebrow">Explainability</span>
        <h3>Speech delivery</h3>
      </div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ left: 12, right: 16 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="label" width={160} tick={{ fill: "#cbd5e1", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Bar dataKey="value" radius={[8, 8, 8, 8]}>
              {data.map((item) => (
                <Cell
                  key={item.label}
                  fill={item.value >= 80 ? "#79bca3" : item.value >= 60 ? "#b9a46d" : "#bd838e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
