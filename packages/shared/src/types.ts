import { z } from "zod";

export const channelSchema = z.enum(["web", "whatsapp", "voice"]);
export type Channel = z.infer<typeof channelSchema>;

export const reservationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "cancelled",
  "no_show",
  "completed",
]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const reservationCoreSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(6).max(20),
  partySize: z.number().int().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format AAAA-MM-JJ"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "format HH:MM"),
  notes: z.string().max(500).optional(),
});
export type ReservationCore = z.infer<typeof reservationCoreSchema>;

export const chatRequestSchema = z.object({
  tenantId: z.string().uuid(),
  channel: channelSchema,
  sessionKey: z.string().min(1),
  message: z.string().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
  conversationId: z.string().uuid(),
  status: z.enum(["in_progress", "completed", "cancelled", "error"]),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
