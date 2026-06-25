/**
 * Seed de développement — insère le tenant OKITO et quelques résas de test.
 *
 * Usage : `pnpm tsx scripts/seed-dev.ts`
 *
 * Idempotent : ré-exécuter ne crée pas de doublons (onConflictDoNothing).
 * Refuse de tourner si NODE_ENV=production (garde-fou).
 */

import "dotenv/config";
import { getDb, schema } from "@okito/db";

if (process.env.NODE_ENV === "production") {
  console.error("seed-dev.ts ne tourne pas en production. NODE_ENV != production.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant — copie .env.example en .env et remplis-le.");
  process.exit(1);
}

const db = getDb();

async function main() {
  // 1. Tenant OKITO
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: "okito",
      name: "OKITO",
      contactEmail: "contact@okito.fr",
      contactPhone: "+33600000000",
      capacityMax: 50,
    })
    .onConflictDoNothing({ target: schema.tenants.slug })
    .returning();

  const okito =
    tenant ?? (await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.slug, "okito") }));

  if (!okito) {
    throw new Error("tenant OKITO introuvable après insert/conflict");
  }

  console.log(`tenant OKITO : ${okito.id}`);

  // 2. Réservations de test sur les 7 prochains jours.
  const today = new Date();
  const fixtures = [
    { offset: 1, heure: "12:30", couverts: 2, name: "Jean Dupont", phone: "+33611111111" },
    { offset: 1, heure: "20:00", couverts: 4, name: "Marie Curie", phone: "+33622222222" },
    { offset: 2, heure: "19:30", couverts: 6, name: "Pierre Martin", phone: "+33633333333" },
    { offset: 3, heure: "13:00", couverts: 3, name: "Sophie Lambert", phone: "+33644444444" },
    { offset: 5, heure: "20:30", couverts: 8, name: "Lucas Bernard", phone: "+33655555555" },
  ];

  let inserted = 0;
  for (const fx of fixtures) {
    const target = new Date(today);
    target.setDate(today.getDate() + fx.offset);
    const isoDate = target.toISOString().slice(0, 10);

    const [row] = await db
      .insert(schema.reservations)
      .values({
        tenantId: okito.id,
        dateReservation: isoDate,
        heure: fx.heure,
        couverts: fx.couverts,
        customerName: fx.name,
        customerPhone: fx.phone,
        source: "manual",
        status: "confirmed",
      })
      .onConflictDoNothing()
      .returning();

    if (row) inserted++;
  }

  console.log(
    `réservations seedées : ${inserted}/${fixtures.length} (le reste = doublons skippés)`,
  );
  console.log("seed terminé.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed failed:", err);
    process.exit(1);
  });
