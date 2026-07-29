interface TimestampLike {
  toDate(): Date;
}

export function formatLastCheckDate(
  timestamp: TimestampLike | Date | number | null | undefined
) {
  if (!timestamp) return "—";

  let date: Date;
  if (typeof timestamp === "object" && "toDate" in timestamp) {
    date = timestamp.toDate();
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return "—";
  }

  if (Number.isNaN(date.getTime())) return "—";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
