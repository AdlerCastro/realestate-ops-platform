"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  registrarVendaSchema,
  formaPagamentoEnum,
  type RegistrarVendaInput,
} from "@/lib/features/vendas/schema";
import {
  normalizarTexto,
  chaveDedup,
  type Cliente,
} from "@/lib/features/clientes/dedup";
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
  const [buscaUnidade, setBuscaUnidade] = useState("");
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
  // Aviso de duplicidade (regra C6 revertida, docs/regras-de-negocio.md) —
  // checado só no submit do "Cliente novo", nunca live/debounced, e nunca
  // bloqueia o cadastro por conta própria.
  const [duplicatasEncontradas, setDuplicatasEncontradas] = useState<
    Cliente[] | null
  >(null);

  function handleClienteNovoNomeChange(value: string) {
    setClienteNovoNome(value);
    setDuplicatasEncontradas(null);
  }

  function handleClienteNovoCidadeChange(value: string) {
    setClienteNovoCidade(value);
    setDuplicatasEncontradas(null);
  }

  function handleModoClienteChange(modo: ModoCliente) {
    setModoCliente(modo);
    setDuplicatasEncontradas(null);
  }

  function usarClienteExistente(cliente: Cliente) {
    setModoCliente("existente");
    setBuscaCliente(cliente.nome);
    setClienteId(String(cliente.id));
    setDuplicatasEncontradas(null);
  }

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

  // Mesma normalização/padrão da busca de cliente acima — filtra por
  // identificador OU nome do empreendimento, sem limite artificial (a
  // seleção final é feita no próprio <select>, não numa lista separada).
  const unidadesFiltradas = useMemo(() => {
    const termo = normalizarTexto(buscaUnidade);
    if (!termo) return unidades;

    return unidades.filter(
      (u) =>
        normalizarTexto(u.identificador).includes(termo) ||
        normalizarTexto(u.empreendimento_nome).includes(termo),
    );
  }, [unidades, buscaUnidade]);

  const mutation = useMutation({
    mutationFn: criarVenda,
    onSuccess: () => {
      toast.success("Venda registrada com sucesso.");
      router.push("/vendas");
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function submeter() {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroValidacao(null);
    mutation.reset();

    if (modoCliente === "novo") {
      const nome = clienteNovoNome.trim();
      const cidade = clienteNovoCidade.trim();
      // Só roda contra nome+cidade preenchidos — sem os dois, a validação
      // Zod normal do submit já barra o cadastro, e uma chave incompleta
      // arriscaria falso positivo entre clientes sem cidade.
      if (nome && cidade) {
        const chave = chaveDedup(nome, cidade);
        const encontrados = clientes.filter(
          (c) => chaveDedup(c.nome, c.cidade ?? "") === chave,
        );
        if (encontrados.length > 0) {
          setDuplicatasEncontradas(encontrados);
          return;
        }
      }
    }

    submeter();
  }

  function cadastrarMesmoAssim() {
    setDuplicatasEncontradas(null);
    submeter();
  }

  return {
    unidades: unidadesFiltradas,
    buscaUnidade,
    setBuscaUnidade,
    unidadeId,
    setUnidadeId,
    valorVenda,
    setValorVenda,
    formaPagamento,
    setFormaPagamento,
    modoCliente,
    setModoCliente: handleModoClienteChange,
    buscaCliente,
    setBuscaCliente,
    clientesFiltrados,
    clienteId,
    setClienteId,
    clienteNovoNome,
    setClienteNovoNome: handleClienteNovoNomeChange,
    clienteNovoCidade,
    setClienteNovoCidade: handleClienteNovoCidadeChange,
    clienteNovoUf,
    setClienteNovoUf,
    clienteNovoEmail,
    setClienteNovoEmail,
    handleSubmit,
    duplicatasEncontradas,
    usarClienteExistente,
    cadastrarMesmoAssim,
    isPending: mutation.isPending,
    erro:
      erroValidacao ??
      (mutation.isError ? (mutation.error as Error).message : null),
  };
}
