import { createHmac, timingSafeEqual } from "node:crypto";
import type { Reservation } from "@okito/db";

/**
 * Génère un flux iCalendar (RFC 5545) à partir de réservations.
 * Neutre par vertical : un "VEVENT" représente n'importe quel créneau
 * (table, rendez-vous, nuitée, mission).
 */
export function buildICalendar(args: {
  tenantName: string;
  tenantId: string;
  reservations: Reservation[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OKITO//Reservations//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${args.tenantName} — Réservations`)}`,
  ];

  for (const r of args.reservations) {
    const start = toICalDateTime(r.dateReservation, r.heure);
    const end = toICalDateTime(r.dateReservation, r.heure, r.durationMinutes ?? 90);
    const summary = `${r.customerName} · ${r.couverts} p.`;
    const descParts = [`Téléphone : ${r.customerPhone}`, `Source : ${r.source}`];
    if (r.notes) descParts.push(`Notes : ${r.notes}`);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@okito`,
      `DTSTAMP:${toICalStamp(r.createdAt as unknown as string | Date)}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(descParts.join("\\n"))}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 §3.1 : lignes pliées à 75 octets, terminées par CRLF.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Plie une ligne >75 octets (continuation = CRLF + espace). RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join("\r\n ");
}

/** date "AAAA-MM-JJ" + heure "HH:MM[:SS]" (+offset min) → "AAAAMMJJTHHMMSS" (heure locale, floating). */
function toICalDateTime(dateIso: string, heure: string, offsetMinutes = 0): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = heure.split(":").map(Number);
  const base = new Date(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0) + offsetMinutes * 60_000,
  );
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${base.getUTCFullYear()}${p(base.getUTCMonth() + 1)}${p(base.getUTCDate())}` +
    `T${p(base.getUTCHours())}${p(base.getUTCMinutes())}00`
  );
}

function toICalStamp(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Signature HMAC stable d'un feed tenant. Le flux iCal est public (les apps
 * calendrier ne portent pas de JWT), mais l'URL est protégée par cette
 * signature : sans le secret serveur, impossible de forger l'URL d'un tenant.
 * Rotation = changer ICAL_FEED_SECRET (invalide tous les abonnements).
 */
export function signFeed(tenantId: string, secret: string): string {
  return createHmac("sha256", secret).update(tenantId).digest("hex");
}

export function verifyFeed(tenantId: string, sig: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = signFeed(tenantId, secret);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
