import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { ReviewService } from "../services/review.js";

const uuidParam = z.string().uuid();

export function adminReviewsRoute(service: ReviewService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/reviews/:tenantId/summary
  app.get("/:tenantId/summary", async (c) => {
    const parsed = uuidParam.safeParse(c.req.param("tenantId"));
    if (!parsed.success) throw new BadRequestError("tenantId invalide", "validation_error");
    const summary = await service.summary(parsed.data);
    return c.json({ data: summary });
  });

  return app;
}
