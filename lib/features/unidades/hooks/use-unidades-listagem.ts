"use client";

import { useMemo, useState } from "react";
import { normalizarTexto } from "@/lib/features/clientes/dedup";
import type { UnidadeListagemItem } from "@/lib/features/unidades/repository";

export type StatusUnidadeFiltro = UnidadeListagemItem["status_canonico"] | "";

interface UseUnidadesListagemParams {
  unidades: UnidadeListagemItem[];
}

/**
 * ViewModel da tabela de unidades em /vendas: busca por identificador +
 * filtro por status_canonico, client-side sobre o universo completo (até
 * 3.300 linhas) já carregado pelo Server Component — mesmo padrão sem
 * round-trip HTTP já usado na listagem de vendas.
 */
export function useUnidadesListagem({ unidades }: UseUnidadesListagemParams) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusUnidadeFiltro>("");

  const termoBusca = useMemo(() => normalizarTexto(busca), [busca]);

  const unidadesFiltradas = useMemo(() => {
    return unidades.filter((u) => {
      if (status && u.status_canonico !== status) return false;
      if (
        termoBusca &&
        !normalizarTexto(u.identificador).includes(termoBusca)
      ) {
        return false;
      }
      return true;
    });
  }, [unidades, status, termoBusca]);

  return {
    busca,
    setBusca,
    status,
    setStatus,
    unidadesFiltradas,
  };
}
