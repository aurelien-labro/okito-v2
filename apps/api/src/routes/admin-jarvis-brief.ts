import { type Database, schema } from "@okito/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, HttpError, NotFoundError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { JarvisAdvisorService } from "../services/jarvis-advisor.js";

const uuidParam = z.string().uuid();
const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Zone "Brief de Jarvis" du dashboard.
 *
 * GET : dernier brief publié sur le bus (event jarvis.brief.generated).
 * POST : régénération à la demande ("Jarvis, refais le point maintenant") —
 * disponible seulement si l'Advisor est câblé (LLM configuré).
 */
export function adminJarvisBriefRoute(db: Database, advisor?: JarvisAdvisorService) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    }
    throw err;
  });

  // GET /v1/admin/jarvis-brief/:tenantId — dernier brief
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const [row] = await db
      .select()
      .from(schema.events)
      .where(
        and(eq(schema.events.tenantId, tenantId), eq(schema.events.type, "jarvis.brief.generated")),
      )
      .orderBy(desc(schema.events.createdAt))
      .limit(1);
    if (!row) throw new NotFoundError("Aucun brief généré pour ce tenant");
    return c.json({ data: { ...(row.payload as Record<string, unknown>), at: row.createdAt } });
  });

  // POST /v1/admin/jarvis-brief/:tenantId/chat — question au journal
  app.post("/:tenantId/chat", async (c) => {
    if (!advisor) {
      throw new BadRequestError("Advisor non configuré (LLM absent)", "advisor_unavailable");
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await c.req.json().catch(() => {
      throw new BadRequestError("JSON invalide", "invalid_json");
    });
    const { messages } = parseOrThrow(chatBodySchema, body, "body");
    const reply = await advisor.chat(tenantId, messages);
    if (!reply) throw new BadRequestError("Le LLM n'a pas produit de réponse", "chat_empty");
    return c.json({ data: { reply } });
  });

  // POST /v1/admin/jarvis-brief/:tenantId — régénérer maintenant
  app.post("/:tenantId", async (c) => {
    if (!advisor) {
      throw new BadRequestError("Advisor non configuré (LLM absent)", "advisor_unavailable");
    }
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const brief = await advisor.generateBrief(tenantId);
    if (!brief) throw new BadRequestError("Le LLM n'a pas produit de brief", "brief_empty");
    return c.json({ data: brief }, 201);
  });

  return app;
}

function parseOrThrow<T>(schemaArg: z.ZodType<T>, value: unknown, label: string): T {
  const result = schemaArg.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
