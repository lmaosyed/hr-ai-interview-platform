import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { JobAnalytics } from "../types/api";

type Props = {
  analytics: JobAnalytics | null;
};

export function AnalyticsCharts({ analytics }: Props) {
  if (!analytics) {
    return <div className="empty-panel">Loading cohort analytics...</div>;
  }

  return (
    <div className="analytics-grid">
      <div className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Cohort</span>
          <h3>Average scores</h3>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.average_scores}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#1f6feb" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Distribution</span>
          <h3>Overall score histogram</h3>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.score_distribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="range_label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                {analytics.score_distribution.map((bucket) => (
                  <Cell key={bucket.range_label} fill={bucket.range_label === "80-100" ? "#1c7c54" : "#f4b942"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Integrity</span>
          <h3>Flag frequency by type</h3>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.integrity_flag_frequency}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="event_type" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#bb3e03" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <div className="section-heading compact">
          <span className="eyebrow">Recommendation</span>
          <h3>Hire signal breakdown</h3>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Tooltip />
              <Pie
                data={analytics.hire_signal_breakdown}
                dataKey="count"
                nameKey="signal"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={6}
              >
                {analytics.hire_signal_breakdown.map((slice) => (
                  <Cell
                    key={slice.signal}
                    fill={
                      slice.signal === "strong"
                        ? "#1c7c54"
                        : slice.signal === "likely"
                          ? "#1f6feb"
                          : slice.signal === "weak"
                            ? "#d88d1f"
                            : "#bb3e03"
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
