import { LegalShell, Section } from "../_components/legal-shell";

export const metadata = {
  title: "Conditions d'utilisation — OKITO",
};

export default function TermsPage() {
  return (
    <LegalShell title="Conditions générales d'utilisation">
      <p className="text-xs text-stone-400">Dernière mise à jour : 3 juillet 2026</p>

      <Section heading="1. Objet">
        <p>
          OKITO fournit un service d&apos;assistant conversationnel de prise de réservations (voix,
          WhatsApp, widget web) et un tableau de bord de gestion pour les professionnels du service
          à créneau. L&apos;utilisation du service implique l&apos;acceptation des présentes
          conditions.
        </p>
      </Section>

      <Section heading="2. Compte et accès">
        <p>
          Le client est responsable de la confidentialité de ses identifiants et de toute activité
          effectuée depuis son compte. OKITO peut suspendre un compte en cas d&apos;usage abusif ou
          contraire à la loi.
        </p>
      </Section>

      <Section heading="3. Disponibilité">
        <p>
          OKITO met en œuvre les moyens raisonnables pour assurer la continuité du service mais ne
          garantit pas une disponibilité ininterrompue. Des interruptions peuvent survenir pour
          maintenance ou en cas de force majeure.
        </p>
      </Section>

      <Section heading="4. Données">
        <p>
          Les données de réservation restent la propriété du client. Le traitement des données
          personnelles est décrit dans notre{" "}
          <a href="/legal/privacy" className="underline">
            politique de confidentialité
          </a>
          .
        </p>
      </Section>

      <Section heading="5. Responsabilité">
        <p>
          OKITO ne saurait être tenu responsable des décisions prises sur la base des informations
          fournies par l&apos;assistant, ni des dommages indirects résultant de l&apos;utilisation
          du service.
        </p>
      </Section>

      <Section heading="6. Résiliation">
        <p>
          Le client peut résilier son abonnement à tout moment. Les données peuvent être exportées
          avant la clôture ; elles sont ensuite supprimées conformément à notre politique de
          conservation.
        </p>
      </Section>

      <Section heading="7. Contact">
        <p>
          Pour toute question :{" "}
          <a href="mailto:hello@okito.app" className="underline">
            hello@okito.app
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
