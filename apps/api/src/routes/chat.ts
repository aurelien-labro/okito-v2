import { chatRequestSchema } from "@okito/shared/types";
import { Hono } from "hono";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ChatService } from "../services/chat.js";

// Le tenantId vient du middleware auth (vérifié) — on ne le lit pas du body.
const chatBodySchema = chatRequestSchema.omit({ tenantId: true });

export function chatRoute(service: ChatService) {
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    const tenantId = c.get("tenantId");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError("JSON invalide", "invalid_json");
    }

    const parsed = chatBodySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"} : ${i.message}`)
        .join("; ");
      throw new BadRequestError(message, "validation_error");
    }

    const response = await service.handle({ ...parsed.data, tenantId });
    return c.json(response);
  });

  return app;
}
