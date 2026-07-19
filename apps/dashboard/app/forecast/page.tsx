import { SkillStub } from "../_components/skill-stub";

export default function ForecastPage() {
  return (
    <SkillStub
      icon="ti-trending-up"
      title="Prévisions & staffing"
      pitch="Combien de couverts la semaine prochaine ? Faut-il ajouter un serveur samedi ? Jarvis projette ton activité à partir de ton historique, la météo et les événements locaux."
      bullets={[
        "Prévision d'affluence J+7 à J+30 par service",
        "Recommandation de staffing : combien de personnes, quels créneaux",
        'Alerte anticipation : "vendredi va être calme, propose une soirée thématique"',
      ]}
    />
  );
}
