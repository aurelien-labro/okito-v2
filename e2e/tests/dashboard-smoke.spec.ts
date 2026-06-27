import { expect, test } from "@playwright/test";

/**
 * Smoke tests dashboard — golden path navigation.
 *
 * Assume :
 * - L'API tourne sur http://localhost:3001 (auto via playwright.config webServer)
 * - Le dashboard tourne sur http://localhost:3000 (idem)
 * - SUPABASE_JWT_SECRET absent côté API (sinon LoginGate bloque) — en dev
 *   sans auth Supabase, le dashboard injecte un X-Tenant-Id depuis localStorage.
 *
 * Pour passer le LoginGate localement sans Supabase :
 *   localStorage.setItem("okito_token", "<jwt-sub-uuid>")
 * (cf. apps/dashboard/app/_components/login-gate.tsx)
 */

test.describe("Dashboard — smoke tests", () => {
  test("la page d'accueil charge le titre OKITO", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/OKITO|Dashboard/);
    await expect(page.getByText(/OKITO/i).first()).toBeVisible();
  });

  test("la sidebar contient les 5 liens de nav", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: /Vue d'ensemble/i })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Réservations/i })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Tenants/i })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Paramètres/i })).toBeVisible();
  });

  test("navigation /reservations affiche le titre Réservations", async ({ page }) => {
    await page.goto("/reservations");
    await expect(page.getByRole("heading", { name: /Réservations/i })).toBeVisible();
  });

  test("navigation /tenants affiche le titre Tenants", async ({ page }) => {
    await page.goto("/tenants");
    await expect(page.getByRole("heading", { name: /Tenants/i })).toBeVisible();
  });
});

test.describe("API — health endpoint", () => {
  test("GET /health renvoie status ok", async ({ request }) => {
    const res = await request.get("http://localhost:3001/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.service).toBe("okito-api");
  });

  test("GET /metrics renvoie du format Prometheus", async ({ request }) => {
    const res = await request.get("http://localhost:3001/metrics");
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("okito_http_requests_total");
  });
});
