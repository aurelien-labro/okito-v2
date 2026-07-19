import Link from "next/link";

export function SkillStub({
  icon,
  title,
  pitch,
  bullets,
}: {
  icon: string;
  title: string;
  pitch: string;
  bullets: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="okito-hairline flex flex-col items-start gap-4 rounded-[12px] bg-white p-6">
        <div className="flex items-center gap-3">
          <span
            className={`ti ${icon} flex h-10 w-10 items-center justify-center rounded-[12px] bg-indigo-50 text-[20px] text-indigo-600`}
            aria-hidden="true"
          />
          <div>
            <h1 className="text-lg font-medium text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">Skill · en préparation</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-700">{pitch}</p>
        <ul className="w-full space-y-1.5 text-sm text-slate-600">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="ti ti-check mt-0.5 text-[14px] text-indigo-600" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/jarvis"
          className="mt-2 rounded-[12px] bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
        >
          En attendant, ouvrir Jarvis
        </Link>
      </div>
    </div>
  );
}
