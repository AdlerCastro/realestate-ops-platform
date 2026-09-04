"use client";

import { useCallback, useMemo, useState } from "react";
import { normalizarTexto } from "@/lib/features/clientes/dedup";
import { formaPagamentoEnum } from "@/lib/features/vendas/schema";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";

export type FormaPagamentoFiltro = (typeof formaPagamentoEnum.options)[number];

interface UseVendasListagemParams {
  vendas: VendaListagemItem[];
}

/**
 * ViewModel da listagem /vendas: busca por cliente/unidade + filtros de
 * forma de pagamento, data de venda e data de distrato, todos combináveis em
 * AND. Opera inteiramente sobre `vendas` (já carregado pelo Server
 * Component) — sem round-trip ao servidor por digitação/filtro (volume da
 * base não justifica paginação server-side).
 */
export function useVendasListagem({ vendas }: UseVendasListagemParams) {
  const [busca, setBusca] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<
    FormaPagamentoFiltro | ""
  >("");
  const [dataVendaDe, setDataVendaDe] = useState("");
  const [dataVendaAte, setDataVendaAte] = useState("");
  const [dataDistratoDe, setDataDistratoDe] = useState("");
  const [dataDistratoAte, setDataDistratoAte] = useState("");

  const termoBusca = useMemo(() => normalizarTexto(busca), [busca]);

  // Filtros aplicáveis às duas tabelas: busca (cliente OU
  // {empreendimento} + {identificador}, unidades.identificador não é único
  // globalmente — ver docs/log-tecnico-decisoes.md seção 5), forma de
  // pagamento e intervalo de data de venda.
  const passaFiltrosComuns = useCallback(
    (item: VendaListagemItem) => {
      if (termoBusca) {
        const alvo = normalizarTexto(
          `${item.cliente_nome} ${item.empreendimento_nome} ${item.unidade_identificador}`,
        );
        if (!alvo.includes(termoBusca)) return false;
      }

      if (formaPagamento && item.forma_pagamento !== formaPagamento) {
        return false;
      }

      if (dataVendaDe || dataVendaAte) {
        const dataVenda = item.data_venda.slice(0, 10);
        if (dataVendaDe && dataVenda < dataVendaDe) return false;
        if (dataVendaAte && dataVenda > dataVendaAte) return false;
      }

      return true;
    },
    [termoBusca, formaPagamento, dataVendaDe, dataVendaAte],
  );

  // Filtro exclusivo da tabela de distratadas — não existe data_distrato em
  // vendas ativas.
  const passaFiltroDataDistrato = useCallback(
    (item: VendaListagemItem) => {
      if (!dataDistratoDe && !dataDistratoAte) return true;
      if (!item.data_distrato) return false;

      const dataDistrato = item.data_distrato.slice(0, 10);
      if (dataDistratoDe && dataDistrato < dataDistratoDe) return false;
      if (dataDistratoAte && dataDistrato > dataDistratoAte) return false;
      return true;
    },
    [dataDistratoDe, dataDistratoAte],
  );

  const vendasAtivas = useMemo(
    () =>
      vendas.filter(
        (v) => v.status_canonico === "ativa" && passaFiltrosComuns(v),
      ),
    [vendas, passaFiltrosComuns],
  );

  const vendasDistratadas = useMemo(
    () =>
      vendas.filter(
        (v) =>
          v.status_canonico === "distrato" &&
          passaFiltrosComuns(v) &&
          passaFiltroDataDistrato(v),
      ),
    [vendas, passaFiltrosComuns, passaFiltroDataDistrato],
  );

  const limparFiltros = useCallback(() => {
    setBusca("");
    setFormaPagamento("");
    setDataVendaDe("");
    setDataVendaAte("");
    setDataDistratoDe("");
    setDataDistratoAte("");
  }, []);

  return {
    busca,
    setBusca,
    formaPagamento,
    setFormaPagamento,
    dataVendaDe,
    setDataVendaDe,
    dataVendaAte,
    setDataVendaAte,
    dataDistratoDe,
    setDataDistratoDe,
    dataDistratoAte,
    setDataDistratoAte,
    limparFiltros,
    vendasAtivas,
    vendasDistratadas,
  };
}
