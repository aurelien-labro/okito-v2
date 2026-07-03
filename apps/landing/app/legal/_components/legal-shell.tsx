import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900 hover:underline">
        ← Retour à l&apos;accueil
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="prose prose-stone mt-8 space-y-4 text-sm leading-relaxed text-stone-700">
        {children}
      </div>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mt-6 text-base font-semibold text-stone-900">{heading}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
