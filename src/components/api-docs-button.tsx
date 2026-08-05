"use client";

import { Button } from "@heroui/react";

export function ApiDocsButton() {
  return (
    <Button
      className="mt-9 bg-[var(--accent)] font-bold text-[#180b06]"
      onPress={() => window.location.assign("http://localhost:8000/docs")}
      size="lg"
      variant="primary"
    >
      Explorar el contrato API
    </Button>
  );
}
