"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { LoginInput } from "@/lib/features/auth/schema";

const GENERIC_ERROR = "Credenciais inválidas.";

async function login(input: LoginInput): Promise<void> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(GENERIC_ERROR);
  }
}

/** ViewModel do formulário de login: orquestra a chamada à API e o redirect pós-sucesso. */
export function useLogin() {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
  });

  return {
    login: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.isError ? GENERIC_ERROR : null,
  };
}
