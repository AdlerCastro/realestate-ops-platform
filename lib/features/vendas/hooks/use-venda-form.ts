"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  registrarVendaSchema,
  formaPagamentoEnum,
  type RegistrarVendaInput,
} from "@/lib/features/vendas/schema";
import { normalizarTexto, type Cliente } from "@/lib/features/clientes/dedup";
import type { UnidadeDisponivel } from "@/lib/features/unidades/repository";
import type { VendaRow } from "@/lib/features/vendas/repository";

interface UseVendaFormParams {
  unidades: UnidadeDisponivel[];
  clientes: Cliente[];
}

type ModoCliente = "existente" | "novo";
type FormaPagamento = (typeof formaPagamentoEnum.options)[number];

const LIMITE_RESULTADOS_BUSCA = 20;

async function criarVenda(input: RegistrarVendaInput): Promise<VendaRow> {
  const response = await fetch("/api/vendas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Não foi possível registrar a venda.");
  }

  return data.venda as VendaRow;
}

/** ViewModel do formulário de venda: estado + validação Zod compartilhada + chamada à API. */
export function useVendaForm({ unidades, clientes }: UseVendaFormParams) {
  const router = useRouter();

  const [unidadeId, setUnidadeId] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("");
  const [modoCliente, setModoCliente] = useState<ModoCliente>("existente");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteNovoNome, setClienteNovoNome] = useState("");
  const [clienteNovoCidade, setClienteNovoCidade] = useState("");
  const [clienteNovoUf, setClienteNovoUf] = useState("");
  const [clienteNovoEmail, setClienteNovoEmail] = useState("");
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);

  // Universo completo já veio do Server Component (sem round-trip HTTP por
  // termo digitado) — filtro no cliente reaproveita a mesma normalização do
  // dedup (lib/features/clientes/dedup.ts), não LIKE em SQL.
  const clientesFiltrados = useMemo(() => {
    const termo = normalizarTexto(buscaCliente);
    if (!termo) return clientes.slice(0, LIMITE_RESULTADOS_BUSCA);

    return clientes
      .filter((c) => normalizarTexto(c.nome).includes(termo))
      .slice(0, LIMITE_RESULTADOS_BUSCA);
  }, [clientes, buscaCliente]);

  const mutation = useMutation({
    mutationFn: criarVenda,
    onSuccess: () => {
      router.push("/vendas");
      router.refresh();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroValidacao(null);
    mutation.reset();

    const payload = {
      unidadeId: unidadeId === "" ? Number.NaN : Number(unidadeId),
      valorVenda: valorVenda === "" ? Number.NaN : Number(valorVenda),
      formaPagamento: formaPagamento === "" ? undefined : formaPagamento,
      ...(modoCliente === "existente"
        ? { clienteId: clienteId === "" ? undefined : Number(clienteId) }
        : {
            clienteNovo: {
              nome: clienteNovoNome,
              cidade: clienteNovoCidade,
              uf: clienteNovoUf || undefined,
              email: clienteNovoEmail || undefined,
            },
          }),
    };

    const parsed = registrarVendaSchema.safeParse(payload);
    if (!parsed.success) {
      setErroValidacao(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    mutation.mutate(parsed.data);
  }

  return {
    unidades,
    unidadeId,
    setUnidadeId,
    valorVenda,
    setValorVenda,
    formaPagamento,
    setFormaPagamento,
    modoCliente,
    setModoCliente,
    buscaCliente,
    setBuscaCliente,
    clientesFiltrados,
    clienteId,
    setClienteId,
    clienteNovoNome,
    setClienteNovoNome,
    clienteNovoCidade,
    setClienteNovoCidade,
    clienteNovoUf,
    setClienteNovoUf,
    clienteNovoEmail,
    setClienteNovoEmail,
    handleSubmit,
    isPending: mutation.isPending,
    erro:
      erroValidacao ??
      (mutation.isError ? (mutation.error as Error).message : null),
  };
}
