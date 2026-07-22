import { INDUSTRY_VALUES, type Industry, schema } from "@okito/db";
import type { Database } from "@okito/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HttpError } from "../lib/errors.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Signup self-serve : un utilisateur fraîchement authentifié (JWT valide,
 * aucun tenant) crée son établissement en un appel. Idempotent — si une
 * membership existe déjà, on renvoie le tenant existant.
 *
 * Monté avec createAuthMiddleware(..., { requireTenant: false }).
 */
export function signupRoute(db: Database) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status as 400 | 401 | 500,
      );
    }
    throw err;
  });

  app.post("/", async (c) => {
    const userId = c.get("userId");
    if (!userId) {
      throw new HttpError(401, "unauthorized", "Authentification requise");
    }

    let body: { name?: unknown; industry?: unknown };
    try {
      body = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Corps JSON requis");
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) {
      throw new HttpError(400, "invalid_name", "Nom d'établissement requis (2-80 caractères)");
    }
    const industry: Industry =
      typeof body.industry === "string" &&
      (INDUSTRY_VALUES as readonly string[]).includes(body.industry)
        ? (body.industry as Industry)
        : "restaurant";

    // Idempotence : une membership existante = on renvoie ce tenant.
    const existing = await db
      .select({ tenantId: schema.tenantMembers.tenantId })
      .from(schema.tenantMembers)
      .where(eq(schema.tenantMembers.userId, userId))
      .limit(1);
    const existingMembership = existing[0];
    if (existingMembership) {
      const tenant = await db.query.tenants.findFirst({
        where: (t, { eq: e }) => e(t.id, existingMembership.tenantId),
        columns: { id: true, slug: true, name: true },
      });
      if (tenant) return c.json({ data: tenant, created: false });
    }

    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ slug, name, industry })
      .returning({ id: schema.tenants.id, slug: schema.tenants.slug, name: schema.tenants.name });
    if (!tenant) {
      throw new HttpError(500, "tenant_create_failed", "Création de l'établissement impossible");
    }

    await db.insert(schema.tenantMembers).values({
      tenantId: tenant.id,
      userId,
      role: "owner",
    });

    return c.json({ data: tenant, created: true }, 201);
  });

  return app;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "commerce"
  );
}
