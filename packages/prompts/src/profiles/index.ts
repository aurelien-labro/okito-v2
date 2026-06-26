import { BEAUTY_PROFILE } from "./beauty.js";
import { GARAGE_PROFILE } from "./garage.js";
import { GENERIC_PROFILE } from "./generic.js";
import { HOTEL_PROFILE } from "./hotel.js";
import { REALESTATE_PROFILE } from "./realestate.js";
import { RENTAL_PROFILE } from "./rental.js";
import { RESTAURANT_PROFILE } from "./restaurant.js";
import type { Industry, IndustryProfile } from "./types.js";

export * from "./types.js";
export {
  BEAUTY_PROFILE,
  GARAGE_PROFILE,
  GENERIC_PROFILE,
  HOTEL_PROFILE,
  REALESTATE_PROFILE,
  RENTAL_PROFILE,
  RESTAURANT_PROFILE,
};

/**
 * Registry complet des 7 verticals OKITO V2. Tout nouveau vertical = ajouter
 * un fichier ici + entrée dans la map.
 */
const PROFILES: Record<Industry, IndustryProfile> = {
  restaurant: RESTAURANT_PROFILE,
  beauty: BEAUTY_PROFILE,
  hotel: HOTEL_PROFILE,
  garage: GARAGE_PROFILE,
  realestate: REALESTATE_PROFILE,
  rental: RENTAL_PROFILE,
  generic: GENERIC_PROFILE,
};

/**
 * Récupère le profil d'un tenant. Si l'industry est inconnue (string libre
 * jamais validée par le type), fallback GENERIC (catch-all neutre).
 */
export function getIndustryProfile(
  industry: Industry | string | null | undefined,
): IndustryProfile {
  if (typeof industry !== "string") return GENERIC_PROFILE;
  return PROFILES[industry as Industry] ?? GENERIC_PROFILE;
}
