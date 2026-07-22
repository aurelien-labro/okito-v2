import { schema } from "@okito/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../tests/_helpers/pg.js";
import type { AppEnv } from "../lib/types.js";
import { signupRoute } from "./signup.js";

describe("signup self-serve /v1/signup", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Hono<AppEnv>;

  function buildApp(userId: string | undefined) {
    const a = new Hono<AppEnv>();
    a.use("*", async (c, next) => {
      c.set("tenantId", "none");
      if (userId) c.set("userId", userId);
      return next();
    });
    a.route("/", signupRoute(ctx.db));
    return a;
  }

  beforeEach(async () => {
    ctx = await createTestDb();
    app = buildApp("user-abc");
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("crée tenant + membership owner pour un nouvel utilisateur", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chez Léa", industry: "restaurant" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; slug: string; name: string };
      created: boolean;
    };
    expect(body.created).toBe(true);
    expect(body.data.name).toBe("Chez Léa");
    expect(body.data.slug).toMatch(/^chez-lea-/);

    const members = await ctx.db
      .select()
      .from(schema.tenantMembers)
      .where(eq(schema.tenantMembers.userId, "user-abc"));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
    expect(members[0]?.tenantId).toBe(body.data.id);
  });

  it("est idempotent : second appel renvoie le tenant existant", async () => {
    const first = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chez Léa" }),
    });
    const firstBody = (await first.json()) as { data: { id: string } };

    const second = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Autre Nom" }),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { data: { id: string }; created: boolean };
    expect(secondBody.created).toBe(false);
    expect(secondBody.data.id).toBe(firstBody.data.id);

    const tenants = await ctx.db.select().from(schema.tenants);
    expect(tenants).toHaveLength(1);
  });

  it("rejette un nom manquant et une industry inconnue tombe en fallback", async () => {
    const bad = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(bad.status).toBe(400);

    const weird = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Garage Momo", industry: "licorne" }),
    });
    expect(weird.status).toBe(201);
    const tenant = await ctx.db.query.tenants.findFirst();
    expect(tenant?.industry).toBe("restaurant");
  });

  it("401 sans userId", async () => {
    const anon = buildApp(undefined);
    const res = await anon.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chez Léa" }),
    });
    expect(res.status).toBe(401);
  });
});
