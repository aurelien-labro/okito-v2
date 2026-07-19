import { SkillStub } from "../_components/skill-stub";

export default function CoachPage() {
  return (
    <SkillStub
      icon="ti-run"
      title="Coach quotidien"
      pitch="Ton routine du matin et du soir : Jarvis te réveille avec un plan de journée, te dit sur quoi te concentrer, et clôt la journée avec un débrief court."
      bullets={[
        "Brief du matin : 3 priorités, ce qui a bougé depuis hier",
        "Nudges dans la journée : rappels d'appels, avis à traiter, factures en retard",
        "Débrief du soir : ce qui a été fait, ce qui reste, indicateurs de la journée",
      ]}
    />
  );
}
