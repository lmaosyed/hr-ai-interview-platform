import type { TimelineEvent } from "../types/api";

type Props = {
  durationSeconds?: number | null;
  events?: TimelineEvent[] | null;
  onSeek?: (seconds: number) => void;
};

export function TimelineHeatmap({ durationSeconds, events, onSeek }: Props) {
  if (!events?.length || !durationSeconds) {
    return <div className="empty-panel">Timeline highlights will appear once the pipeline processes a session.</div>;
  }

  return (
    <div className="chart-card">
      <div className="section-heading compact">
        <span className="eyebrow">Observability</span>
        <h3>Interview heatmap timeline</h3>
      </div>
      <div className="timeline-rail">
        {events.map((event, index) => {
          const left = `${Math.min(96, (event.timestamp / durationSeconds) * 100)}%`;
          const tone = event.type.includes("answer") ? "good" : "risk";
          return (
            <span
              className={`timeline-pin ${tone}`}
              key={`${event.type}-${event.timestamp}-${index}`}
              style={{ left }}
              title={`${event.timestamp}s · ${event.description}`}
            />
          );
        })}
      </div>
      <div className="timeline-list">
        {events.map((event, index) => (
          <button type="button" className="timeline-item" style={{ textAlign: "left", width: "100%", color: "inherit" }} onClick={() => onSeek?.(event.timestamp)} key={`${event.type}-${event.timestamp}-${index}`}>
            <strong>{event.timestamp.toFixed(0).padStart(2, "0")}s</strong>
            <span>{event.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
