import { LegalShell, Section } from "../_components/legal-shell";

export const metadata = {
  title: "Politique de confidentialité — OKITO",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Politique de confidentialité">
      <p className="text-xs text-stone-400">Dernière mise à jour : 3 juillet 2026</p>

      <Section heading="1. Responsable du traitement">
        <p>
          Les données collectées via OKITO sont traitées pour le compte du professionnel
          (l&apos;établissement) qui utilise le service. OKITO agit en tant que sous-traitant au
          sens du RGPD.
        </p>
      </Section>

      <Section heading="2. Données collectées">
        <p>
          Dans le cadre d&apos;une réservation : nom, numéro de téléphone, éventuellement email,
          date/heure et détails de la demande. Aucune donnée sensible n&apos;est requise.
        </p>
      </Section>

      <Section heading="3. Finalités">
        <p>
          Les données servent uniquement à traiter la réservation, envoyer les confirmations et
          rappels, et permettre à l&apos;établissement de gérer son activité. Aucune revente à des
          tiers.
        </p>
      </Section>

      <Section heading="4. Hébergement">
        <p>
          Les données sont hébergées en Europe (Supabase, région Paris). Les transferts éventuels
          respectent les garanties du RGPD.
        </p>
      </Section>

      <Section heading="5. Conservation">
        <p>
          Les données de réservation sont conservées le temps nécessaire à la relation, puis
          supprimées ou anonymisées.
        </p>
      </Section>

      <Section heading="6. Vos droits">
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification et
          d&apos;effacement de vos données. Pour exercer votre droit à l&apos;oubli, contactez
          l&apos;établissement concerné ou écrivez à{" "}
          <a href="mailto:privacy@okito.app" className="underline">
            privacy@okito.app
          </a>
          .
        </p>
      </Section>

      <Section heading="7. Cookies">
        <p>
          Le site n&apos;utilise que les cookies strictement nécessaires à son fonctionnement. Aucun
          cookie publicitaire ou de tracking tiers n&apos;est déposé.
        </p>
      </Section>
    </LegalShell>
  );
}
