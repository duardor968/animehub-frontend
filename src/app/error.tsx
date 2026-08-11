"use client";

import { RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-shell error-state">
      <div>
        <span className="eyebrow">Conexión interrumpida</span>
        <h1>No se pudo cargar esta vista</h1>
        <p>La información conservada no está disponible en este momento.</p>
        <button className="primary-button error-retry" onClick={reset}>
          <RefreshCw size={16} /> Reintentar
        </button>
      </div>
    </main>
  );
}
