import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-[1600px] place-items-center px-6 py-20 text-center">
      <div className="max-w-lg">
        <h1 className="font-(family-name:--font-display) text-4xl font-semibold tracking-tight text-foreground">
          No está aquí
        </h1>
        <p className="mt-4 text-muted">
          La obra no existe o ya no está disponible en la fuente.
        </p>
        <Link
          className="mx-auto mt-6 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-semibold text-accent-foreground"
          href="/catalogo"
        >
          Volver al catálogo
        </Link>
      </div>
    </main>
  );
}
