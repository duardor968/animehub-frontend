import { ApiDocsButton } from "@/components/api-docs-button";

export default function Home() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden px-6 py-6 sm:px-10 lg:px-16">
      <div
        aria-hidden="true"
        className="ambient pointer-events-none absolute -right-[18rem] -top-[20rem] -z-20 h-[52rem] w-[52rem] rounded-full bg-[radial-gradient(circle,rgba(255,107,53,0.38)_0%,rgba(255,107,53,0.09)_38%,transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
      />

      <nav className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <span className="text-sm font-black uppercase tracking-[0.28em]">
          AnimeHub
        </span>
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[var(--muted)]">
          Foundation 0.1
        </span>
      </nav>

      <section className="grid min-h-[calc(100svh-6.5rem)] content-end gap-12 pb-10 pt-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <div className="reveal max-w-5xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">
            Catálogo abierto · control personal
          </p>
          <h1 className="max-w-4xl text-balance text-[clamp(3.6rem,10vw,8.8rem)] font-black leading-[0.82] tracking-[-0.075em]">
            Anime,
            <br />
            sin fricción.
          </h1>
          <p className="mt-8 max-w-xl text-pretty text-base leading-7 text-[var(--muted)] sm:text-lg">
            Una nueva base para descubrir episodios en la web y administrar tu
            biblioteca desde una aplicación nativa.
          </p>
          <ApiDocsButton />
        </div>

        <div className="reveal-late border-t border-[var(--line)] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Superficies
          </p>
          <ol className="space-y-5 font-mono text-sm">
            <li className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <span>01 / Web</span>
              <span className="text-[var(--accent)]">Editorial</span>
            </li>
            <li className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <span>02 / API</span>
              <span className="text-[var(--muted)]">Central</span>
            </li>
            <li className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <span>03 / Desktop</span>
              <span className="text-[var(--muted)]">Personal</span>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}
