import type { Tenant } from "@okito/db";
import { describe, expect, it } from "vitest";
import { depositRequirementFor, formatDeposit } from "./deposit-policy.js";

function tenant(
  overrides: Partial<
    Pick<Tenant, "depositAmountCents" | "depositRequiredAboveParty" | "depositCurrency">
  > = {},
) {
  return {
    depositAmountCents: 0,
    depositRequiredAboveParty: 0,
    depositCurrency: "EUR" as const,
    ...overrides,
  };
}

describe("depositRequirementFor", () => {
  it("feature OFF si depositAmountCents = 0 (défaut)", () => {
    const r = depositRequirementFor(tenant(), { couverts: 10 });
    expect(r.required).toBe(false);
    expect(r.amountCents).toBe(0);
  });

  it("acompte systématique si threshold = 0 et amount > 0", () => {
    const r = depositRequirementFor(
      tenant({ depositAmountCents: 1000, depositRequiredAboveParty: 0 }),
      { couverts: 2 },
    );
    expect(r.required).toBe(true);
    expect(r.amountCents).toBe(1000);
    expect(r.reason).toContain("systématique");
  });

  it("acompte conditionnel : couverts >= threshold", () => {
    const cfg = tenant({ depositAmountCents: 2000, depositRequiredAboveParty: 6 });
    expect(depositRequirementFor(cfg, { couverts: 5 }).required).toBe(false);
    expect(depositRequirementFor(cfg, { couverts: 6 }).required).toBe(true);
    expect(depositRequirementFor(cfg, { couverts: 10 }).required).toBe(true);
  });

  it("reason mentionne le seuil quand acompte conditionnel", () => {
    const r = depositRequirementFor(
      tenant({ depositAmountCents: 1500, depositRequiredAboveParty: 8 }),
      { couverts: 10 },
    );
    expect(r.reason).toContain("8");
  });

  it("currency propagé du tenant", () => {
    const r = depositRequirementFor(tenant({ depositAmountCents: 1000, depositCurrency: "GBP" }), {
      couverts: 2,
    });
    expect(r.currency).toBe("GBP");
  });
});

describe("formatDeposit", () => {
  it("formate en EUR FR par défaut", () => {
    // Le nbsp peut varier selon Node; on teste les morceaux clés
    const s = formatDeposit(1250, "EUR", "fr-FR");
    expect(s).toContain("12,50");
    expect(s).toContain("€");
  });

  it("formate en USD en-US", () => {
    expect(formatDeposit(1250, "USD", "en-US")).toBe("$12.50");
  });

  it("formate 0 correctement", () => {
    const s = formatDeposit(0, "EUR", "fr-FR");
    expect(s).toContain("0,00");
  });
});
