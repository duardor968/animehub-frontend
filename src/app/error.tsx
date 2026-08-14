"use client";

import { Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-[1600px] place-items-center px-6 py-20 text-center">
      <div className="max-w-lg">
        <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2F81F7]">
          Conexión interrumpida
        </span>
        <h1 className="mt-3 font-(family-name:--font-display) text-4xl font-semibold tracking-tight text-[#F3F8FC]">
          No se pudo cargar esta vista
        </h1>
        <p className="mt-4 text-[#8FA3B4]">
          La información conservada no está disponible en este momento.
        </p>
        <Button
          className="mx-auto mt-6 h-11 rounded-xl bg-[#2F81F7] px-5 font-semibold text-[#FFFFFF] shadow-none"
          onPress={reset}
        >
          <RefreshCw size={16} /> Reintentar
        </Button>
      </div>
    </main>
  );
}
