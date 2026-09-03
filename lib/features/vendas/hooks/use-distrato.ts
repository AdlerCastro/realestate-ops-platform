"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

async function distratarVenda(vendaId: number): Promise<void> {
  const response = await fetch("/api/distratos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendaId }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Não foi possível registrar o distrato.");
  }
}

/** ViewModel do botão de distrato: orquestra a chamada à API e o refresh da listagem. */
export function useDistrato() {
  const router = useRouter();
  const [vendaIdEmAndamento, setVendaIdEmAndamento] = useState<number | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: distratarVenda,
    onMutate: (vendaId) => setVendaIdEmAndamento(vendaId),
    onSuccess: () => router.refresh(),
    onSettled: () => setVendaIdEmAndamento(null),
  });

  return {
    distratar: mutation.mutate,
    vendaIdEmAndamento,
    isPending: mutation.isPending,
    erro: mutation.isError ? (mutation.error as Error).message : null,
    vendaComErro: mutation.isError ? mutation.variables : null,
  };
}
