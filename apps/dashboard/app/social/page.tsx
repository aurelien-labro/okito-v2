import { SkillStub } from "../_components/skill-stub";

export default function SocialPage() {
  return (
    <SkillStub
      icon="ti-brand-instagram"
      title="Social auto-piloté"
      pitch="Jarvis rédige et programme tes posts Instagram, Facebook et Google Business à partir de ton actu (nouveauté carte, événement, photo prise en cuisine)."
      bullets={[
        "Génération auto : légende + hashtags à partir d'une photo ou d'une note vocale",
        "Programmation multi-canal aux horaires optimaux",
        "Réponses aux commentaires proposées et validées en un clic",
      ]}
    />
  );
}
