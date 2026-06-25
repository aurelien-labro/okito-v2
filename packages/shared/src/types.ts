import { z } from "zod";

// Canaux possibles d'une conversation (matche conversations.channel en DB).
export const channelSchema = z.enum(["web_widget", "whatsapp", "voice", "manual"]);
export type Channel = z.infer<typeof channelSchema>;

// Source d'une réservation (matche reservations.source en DB, inclut "unknown").
export const reservationSourceSchema = z.enum([
  "web_widget",
  "whatsapp",
  "voice",
  "manual",
  "unknown",
]);
export type ReservationSource = z.infer<typeof reservationSourceSchema>;

export const reservationStatusSchema = z.enum(["confirmed", "cancelled", "no_show", "completed"]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

// Cœur métier d'une réservation. Noms FR alignés sur SCHEMA.sql et BUSINESS_RULES.md.
export const reservationCoreSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerPhone: z.string().min(6).max(20),
  customerEmail: z.string().email().optional(),
  couverts: z.number().int().min(1).max(20),
  dateReservation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format AAAA-MM-JJ"),
  heure: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "format HH:MM"),
  notes: z.string().max(500).optional(),
});
export type ReservationCore = z.infer<typeof reservationCoreSchema>;

export const chatRequestSchema = z.object({
  tenantId: z.string().uuid(),
  channel: channelSchema,
  sessionKey: z.string().min(1).max(255),
  message: z.string().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
  conversationId: z.string().uuid(),
  status: z.enum(["in_progress", "completed", "cancelled", "error"]),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
