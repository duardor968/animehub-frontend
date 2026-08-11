import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-shell error-state">
      <div>
        <h1>No está aquí</h1>
        <p>La obra no existe o ya no está disponible en la fuente.</p>
        <Link className="primary-button" href="/catalogo">
          Volver al catálogo
        </Link>
      </div>
    </main>
  );
}
