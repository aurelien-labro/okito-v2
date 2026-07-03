/** Durée en minutes → libellé humain ("30 min", "1h30", "2 jours"). */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  if (min >= 1440 && min % 1440 === 0) {
    const days = min / 1440;
    return days === 1 ? "1 jour" : `${days} jours`;
  }
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`;
}

/** "HH:MM[:SS]" → minutes depuis minuit. */
export function hhmmToMinutes(heure: string): number {
  const [h, m] = heure.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
