"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoStep, LandingContent } from "../_content";

interface VisibleStep {
  step: DemoStep;
  key: number;
  countdownEnd: number | null;
}

const AVATAR: Record<DemoStep["kind"], { cls: string; label: string }> = {
  system: { cls: "a-sys", label: "↳" },
  customer: { cls: "a-cust", label: "L" },
  jarvis: { cls: "a-jarvis", label: "J" },
  owner: { cls: "a-owner", label: "A" },
};

const BUBBLE_CLS: Record<DemoStep["kind"], string> = {
  system: "bubble system",
  customer: "bubble review",
  jarvis: "bubble jarvis",
  owner: "bubble",
};

function Countdown({
  end,
  prefix,
  sentLabel,
}: {
  end: number;
  prefix: string;
  sentLabel: string;
}) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((end - Date.now()) / 1000)));

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000);
    return () => clearTimeout(t);
  }, [left, end]);

  if (left <= 0) {
    return <span className="chip good">{sentLabel}</span>;
  }
  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return (
    <span className="chip warn">
      {prefix}{" "}
      <span className="countdown">
        {h}:{m}:{s}
      </span>
    </span>
  );
}

export function JarvisDemo({ t }: { t: LandingContent["demo"] }) {
  const [visible, setVisible] = useState<VisibleStep[]>([]);
  const [status, setStatus] = useState(t.footIdle);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runId = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);

  const run = useCallback(() => {
    runId.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible([]);
    setStatus(t.footRunning);

    t.steps.forEach((step, i) => {
      timers.current.push(
        setTimeout(() => {
          setVisible((prev) => [
            ...prev,
            {
              step,
              key: runId.current * 1000 + i,
              countdownEnd: null,
            },
          ]);
          requestAnimationFrame(() => {
            threadRef.current?.lastElementChild?.scrollIntoView({
              block: "nearest",
              behavior: "smooth",
            });
          });
          const countdown = step.chips?.find((c) => c.countdown)?.countdown;
          if (countdown) {
            const end = Date.now() + countdown * 1000 + 100;
            timers.current.push(
              setTimeout(() => {
                setVisible((prev) =>
                  prev.map((v) =>
                    v.key === runId.current * 1000 + i ? { ...v, countdownEnd: end } : v,
                  ),
                );
              }, 100),
            );
          }
        }, step.delay),
      );
    });

    const lastDelay = t.steps[t.steps.length - 1]?.delay ?? 0;
    timers.current.push(setTimeout(() => setStatus(t.footDone), lastDelay + 500));
  }, [t]);

  useEffect(() => {
    run();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [run]);

  return (
    <section className="demo" aria-label="Démonstration Jarvis">
      <div className="demo-head">
        <div className="demo-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="demo-title">
          {t.title}
          <b>{t.titleBold}</b>
        </div>
      </div>
      <div className="demo-body">
        <div className="thread" ref={threadRef} aria-live="polite">
          {visible.map(({ step, key, countdownEnd }) => (
            <div className="msg" key={key}>
              <div className={`avatar ${AVATAR[step.kind].cls}`}>{AVATAR[step.kind].label}</div>
              <div className={BUBBLE_CLS[step.kind]}>
                {step.who && (
                  <div className="who">
                    {step.who}
                    {step.stars && <span className="stars">{step.stars}</span>}
                  </div>
                )}
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: contenu statique de _content.ts, aucune entrée utilisateur */}
                <span dangerouslySetInnerHTML={{ __html: step.html }} />
                {step.chips && (
                  <div className="action-row">
                    {step.chips.map((chip) =>
                      chip.countdown ? (
                        <Countdown
                          key="countdown"
                          end={countdownEnd ?? Date.now() + chip.countdown * 1000}
                          prefix={t.countdownPrefix}
                          sentLabel={t.sent}
                        />
                      ) : (
                        <span
                          key={chip.label}
                          className={`chip${chip.tone ? ` ${chip.tone}` : ""}`}
                        >
                          {chip.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="demo-foot">
        <span>{status}</span>
        <button className="replay" type="button" onClick={run}>
          {t.replay}
        </button>
      </div>
    </section>
  );
}
