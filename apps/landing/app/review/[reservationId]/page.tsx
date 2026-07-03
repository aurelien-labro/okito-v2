"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_OKITO_API_URL ?? "http://localhost:3001";

interface ReviewContext {
  tenantName: string;
  customerFirstName: string;
  dateReservation: string;
  alreadyReviewed: boolean;
  rating: number | null;
}

export default function ReviewPage({ params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = use(params);
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-50" />}>
      <ReviewForm reservationId={reservationId} />
    </Suspense>
  );
}

function ReviewForm({ reservationId }: { reservationId: string }) {
  const searchParams = useSearchParams();
  const sig = searchParams.get("sig") ?? "";

  const [ctx, setCtx] = useState<ReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/review/${reservationId}?sig=${sig}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Lien invalide");
      setCtx(body.data);
      if (body.data.alreadyReviewed) setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [reservationId, sig]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (rating < 1) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/review/${reservationId}?sig=${sig}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Échec");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        {loading ? (
          <p className="text-center text-sm text-stone-500">Chargement…</p>
        ) : !ctx ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Lien invalide</h1>
            <p className="mt-2 text-sm text-stone-500">
              {err ?? "Ce lien d'avis est introuvable."}
            </p>
          </div>
        ) : done ? (
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              Merci {ctx.customerFirstName} !
            </h1>
            <p className="mt-2 text-sm text-stone-500">Votre avis a bien été pris en compte.</p>
          </div>
        ) : (
          <>
            <p className="text-xs uppercase tracking-widest text-stone-400">{ctx.tenantName}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              Comment s'est passée votre visite ?
            </h1>
            <div className="mt-6 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-4xl ${n <= rating ? "text-amber-400" : "text-stone-200"}`}
                  aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Un mot (optionnel)…"
              className="mt-4 w-full rounded border border-stone-300 px-3 py-2 text-sm"
            />
            {err && <div className="mt-3 text-sm text-rose-700">{err}</div>}
            <button
              type="button"
              onClick={submit}
              disabled={busy || rating < 1}
              className="mt-4 w-full rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? "Envoi…" : "Envoyer mon avis"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
