import { Inngest } from "inngest";

/**
 * Client Inngest pour OKITO API.
 *
 * Inngest = orchestrateur de cron + step functions hébergé. Notre API ne fait
 * que (1) déclarer ses functions et (2) exposer un endpoint que le dashboard
 * Inngest scrape pour découvrir et invoquer ces functions à l'heure dite.
 *
 * Pas de cron in-process : si plusieurs instances API tournent, Inngest
 * dédoublonne automatiquement.
 *
 * En local : utiliser `npx inngest-cli@latest dev` (dev server gratuit) et
 * pointer-le sur http://localhost:3001/api/inngest.
 * En prod : signer la requête via INNGEST_SIGNING_KEY pour que seule Inngest
 * cloud puisse invoquer nos functions.
 */
export const inngest = new Inngest({
  id: "okito-api",
});
