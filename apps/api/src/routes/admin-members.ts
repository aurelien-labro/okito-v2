import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";
import type { TenantMemberService } from "../services/tenant-member.js";

const uuidParam = z.string().uuid();
const roleEnum = z.enum(["owner", "manager", "staff"]);

const inviteSchema = z.object({
  email: z.string().email().max(200),
  role: roleEnum,
});
const updateRoleSchema = z.object({ role: roleEnum });

export function adminMembersRoute(service: TenantMemberService) {
  const app = new Hono<AppEnv>();

  // GET /v1/admin/members/:tenantId — liste des membres d'un tenant
  app.get("/:tenantId", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const rows = await service.listByTenant(tenantId);
    return c.json({ data: rows });
  });

  // POST /v1/admin/members/:tenantId/invite — inviter un membre par email
  app.post("/:tenantId/invite", async (c) => {
    const tenantId = parseOrThrow(uuidParam, c.req.param("tenantId"), "tenantId");
    const body = await readJson(c);
    const input = parseOrThrow(inviteSchema, body, "body");
    const row = await service.invite({ tenantId, email: input.email, role: input.role });
    return c.json({ data: row }, 201);
  });

  // PATCH /v1/admin/members/:memberId/role — changer le rôle
  app.patch("/:memberId/role", async (c) => {
    const memberId = parseOrThrow(uuidParam, c.req.param("memberId"), "memberId");
    const body = await readJson(c);
    const { role } = parseOrThrow(updateRoleSchema, body, "body");
    const row = await service.updateRole({ memberId, role });
    return c.json({ data: row });
  });

  // DELETE /v1/admin/members/:memberId — retirer un membre
  app.delete("/:memberId", async (c) => {
    const memberId = parseOrThrow(uuidParam, c.req.param("memberId"), "memberId");
    await service.remove(memberId);
    return c.json({ data: { ok: true } });
  });

  return app;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestError("JSON invalide", "invalid_json");
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.join(".") || label} : ${i.message}`)
    .join("; ");
  throw new BadRequestError(message, "validation_error");
}
