import { SkillStub } from "../_components/skill-stub";

export default function RadarPage() {
  return (
    <SkillStub
      icon="ti-radar-2"
      title="Radar concurrence"
      pitch="Jarvis surveille tes concurrents locaux : nouveaux avis, changements de carte, promos, positionnement Google. Tu reçois un condensé hebdomadaire actionnable."
      bullets={[
        "Cartographie des concurrents dans ta zone",
        "Alertes : nouveau concurrent, changement de prix, avis viral",
        "Synthèse hebdo : où tu gagnes, où tu perds, une action concrète",
      ]}
    />
  );
}
