"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { RespostaAssistente } from "@/lib/features/assistente/repository";

async function perguntarAssistente(
  pergunta: string,
): Promise<RespostaAssistente> {
  const response = await fetch("/api/assistente", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Não foi possível consultar o assistente.");
  }

  return data as RespostaAssistente;
}

/** ViewModel do assistente: campo de pergunta + chamada à API + resultado da última pergunta. */
export function useAssistente() {
  const [pergunta, setPergunta] = useState("");

  const mutation = useMutation({
    mutationFn: perguntarAssistente,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const texto = pergunta.trim();
    if (!texto) return;
    mutation.mutate(texto);
  }

  return {
    pergunta,
    setPergunta,
    handleSubmit,
    isPending: mutation.isPending,
    resultado: mutation.data ?? null,
    erro: mutation.isError ? (mutation.error as Error).message : null,
  };
}
