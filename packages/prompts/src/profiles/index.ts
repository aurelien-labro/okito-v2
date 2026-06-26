import { HOTEL_PROFILE } from "./hotel.js";
import { RESTAURANT_PROFILE } from "./restaurant.js";
import type { Industry, IndustryProfile } from "./types.js";

export * from "./types.js";
export { HOTEL_PROFILE, RESTAURANT_PROFILE };

/**
 * Registry des profils. Ajouter ici chaque vertical au fur et à mesure
 * (garage.ts, beauty.ts, …).
 */
const PROFILES: Partial<Record<Industry, IndustryProfile>> = {
  restaurant: RESTAURANT_PROFILE,
  hotel: HOTEL_PROFILE,
};

/**
 * Récupère le profil d'un tenant. Si l'industry est inconnue ou pas encore
 * implémentée, on retombe sur restaurant (notre premier vertical, qui sert
 * aussi de défaut sain pour démarrer un nouveau client en mode "réservation").
 */
export function getIndustryProfile(
  industry: Industry | string | null | undefined,
): IndustryProfile {
  if (typeof industry !== "string") return RESTAURANT_PROFILE;
  return PROFILES[industry as Industry] ?? RESTAURANT_PROFILE;
}
