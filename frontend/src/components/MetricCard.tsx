type Props = {
  label: string;
  value: number | null | undefined;
};

export function MetricCard({ label, value }: Props) {
  const numericValue = value ?? 0;
  const tone = value == null ? "" : numericValue >= 80 ? "good" : numericValue >= 60 ? "medium" : "bad";

  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value == null ? "Unscored" : Math.round(numericValue)}</strong>
    </div>
  );
}
