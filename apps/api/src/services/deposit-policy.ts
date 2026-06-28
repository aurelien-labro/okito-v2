import type { Tenant } from "@okito/db";

/**
 * Policy pure (sans side-effects) : "cette résa requiert-elle un acompte ?".
 *
 * Règle V0 simple :
 *   - Si tenant.depositAmountCents = 0 → feature OFF, jamais d'acompte.
 *   - Si tenant.depositRequiredAboveParty = 0 → demandé pour TOUTES les résas
 *     (cas hôtel / chef's table avec acompte systématique).
 *   - Sinon → acompte si couverts >= seuil (cas groupe à partir de 6).
 *
 * Évolutions futures (à coder dans cette même fonction quand pertinent) :
 *   - Acompte uniquement le week-end
 *   - Acompte au-dessus de X heures de réservation (créneaux premium)
 *   - Acompte personnalisé par client (VIP exempté, nouveau client systématique)
 */
export interface DepositRequirement {
  required: boolean;
  amountCents: number;
  currency: string;
  reason?: string;
}

export function depositRequirementFor(
  tenant: Pick<Tenant, "depositAmountCents" | "depositRequiredAboveParty" | "depositCurrency">,
  reservation: { couverts: number },
): DepositRequirement {
  const amount = tenant.depositAmountCents ?? 0;
  const currency = tenant.depositCurrency ?? "EUR";
  if (amount <= 0) {
    return { required: false, amountCents: 0, currency };
  }
  const threshold = tenant.depositRequiredAboveParty ?? 0;
  if (threshold === 0) {
    return {
      required: true,
      amountCents: amount,
      currency,
      reason: "Acompte systématique configuré par l'établissement.",
    };
  }
  if (reservation.couverts >= threshold) {
    return {
      required: true,
      amountCents: amount,
      currency,
      reason: `Acompte demandé à partir de ${threshold} personnes.`,
    };
  }
  return { required: false, amountCents: 0, currency };
}

/**
 * Formate un montant en centimes vers la string lisible "12,50 €" / "$12.50".
 * Utilise Intl.NumberFormat pour la locale FR par défaut.
 */
export function formatDeposit(amountCents: number, currency = "EUR", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountCents / 100);
}
