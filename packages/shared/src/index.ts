export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDurationMs(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} s`;
  }

  return `${value.toFixed(1)} ms`;
}

export function formatTimestamp(value: number | null) {
  if (!value) {
    return "never";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
