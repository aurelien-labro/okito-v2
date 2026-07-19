import Link from "next/link";

export function LandingHeader() {
  return (
    <header className="okito-hairline-b sticky top-0 z-10 flex items-center justify-between bg-white/80 px-6 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-black text-xs font-medium text-white">
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
          className="okito-hairline rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
        >
          Se connecter
        </Link>
        <Link
          href="/pricing"
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Commencer
        </Link>
      </div>
    </header>
  );
}
