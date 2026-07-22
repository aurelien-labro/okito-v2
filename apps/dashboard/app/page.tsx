import { redirect } from "next/navigation";

/**
 * La vitrine publique OKITO vit dans apps/landing (design Jarvis).
 * Le dashboard est l'app : sa racine renvoie directement vers /app
 * (login ou cockpit selon la session) — comme app.stripe.com.
 */
export default function RootPage() {
  redirect("/app");
}
