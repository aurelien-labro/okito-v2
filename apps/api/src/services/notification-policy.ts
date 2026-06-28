import type { Tenant } from "@okito/db";

/**
 * Helpers purs (sans I/O) qui décident "qui notifier sur quels canaux pour
 * cet event ?" en lisant les préférences du tenant. Le Notifier reste
 * responsable de l'envoi physique (Resend / Twilio / 360dialog) — cette
 * couche dit juste QUOI envoyer à QUI.
 *
 * Convention :
 * - Si la préférence n'existe pas pour un audience/event → on retourne aucun
 *   canal (= silencieux par défaut, on ne suppose pas).
 * - Canaux désactivés au niveau tenant (pas de contactEmail, pas de
 *   contactPhone, pas de notifier configuré côté infra) sont filtrés en aval
 *   par le Notifier — ici on retourne juste la *préférence*.
 */

export type EventType = "reservation.created" | "reservation.cancelled" | "reservation.reminder";
export type Audience = "manager" | "client";
export type Channel = "email" | "whatsapp" | "sms";

export interface ResolvedNotification {
  audience: Audience;
  channels: Channel[];
}

export function channelsFor(
  tenant: Pick<Tenant, "notificationPreferences">,
  event: EventType,
  audience: Audience,
): Channel[] {
  const prefs = tenant.notificationPreferences ?? {};
  // Cast vers une shape uniforme — TS refuse l'union manager|client sinon.
  const branch = prefs[audience] as
    | {
        onCreate?: NotificationChannelsSet;
        onCancel?: NotificationChannelsSet;
        onReminder?: NotificationChannelsSet;
      }
    | undefined;
  if (!branch) return [];
  let set: NotificationChannelsSet | undefined;
  if (event === "reservation.created") set = branch.onCreate;
  else if (event === "reservation.cancelled" && audience === "manager") set = branch.onCancel;
  else if (event === "reservation.reminder" && audience === "client") set = branch.onReminder;
  if (!set) return [];
  const out: Channel[] = [];
  if (set.email) out.push("email");
  if (set.whatsapp) out.push("whatsapp");
  if (set.sms) out.push("sms");
  return out;
}

type NotificationChannelsSet = { email?: boolean; whatsapp?: boolean; sms?: boolean };

/**
 * Résout tous les destinataires pour un event donné — utile pour itérer
 * d'un seul coup dans le notifier wrapper.
 */
export function recipientsFor(
  tenant: Pick<Tenant, "notificationPreferences">,
  event: EventType,
): ResolvedNotification[] {
  const out: ResolvedNotification[] = [];
  const managerCh = channelsFor(tenant, event, "manager");
  if (managerCh.length > 0) out.push({ audience: "manager", channels: managerCh });
  const clientCh = channelsFor(tenant, event, "client");
  if (clientCh.length > 0) out.push({ audience: "client", channels: clientCh });
  return out;
}
