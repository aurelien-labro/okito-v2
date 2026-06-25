export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">OKITO V2</h1>
      <p className="mt-3 text-stone-600">
        Dashboard manager — Phase 0 (bootstrap). Les écrans réservations arrivent en Phase 1.
      </p>
      <ul className="mt-8 space-y-2 text-sm text-stone-700">
        <li>
          <a className="underline" href="/test">
            → Page test du moteur conversationnel (Phase 1)
          </a>
        </li>
        <li>
          <code className="rounded bg-stone-200 px-2 py-1">GET http://localhost:3001/health</code>
        </li>
      </ul>
    </main>
  );
}
