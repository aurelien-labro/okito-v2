import Link from "next/link";

export function LandingHeader() {
  return (
    <header className="okito-hairline-b sticky top-0 z-10 flex items-center justify-between bg-[var(--okito-bg)]/85 px-6 py-3 backdrop-blur">
      <Link href="/" className="group flex items-center gap-2.5">
        <div className="okito-brand-mark flex size-7 items-center justify-center rounded-md text-xs font-medium text-white transition-transform group-hover:scale-105">
          O
        </div>
        <span className="text-sm font-semibold tracking-tight">OKITO</span>
      </Link>
      <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
        <Link href="/#skills" className="hover:text-slate-900">
          Skills
        </Link>
        <Link href="/#modules" className="hover:text-slate-900">
          Modules
        </Link>
        <Link href="/pricing" className="hover:text-slate-900">
          Tarifs
        </Link>
      </nav>
      <div className="flex items-center gap-2">
        <Link
          href="/app"
          className="okito-hairline okito-hover rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
        >
          Se connecter
        </Link>
        <Link
          href="/pricing"
          className="okito-hover rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Commencer
        </Link>
      </div>
    </header>
  );
}
