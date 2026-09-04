"use client";

import { useMemo, useState } from "react";
import { normalizarTexto } from "@/lib/features/clientes/dedup";
import type { UnidadeListagemItem } from "@/lib/features/unidades/repository";

export type StatusUnidadeFiltro = UnidadeListagemItem["status_canonico"] | "";

interface UseUnidadesListagemParams {
  unidades: UnidadeListagemItem[];
}

/**
 * ViewModel da tabela de unidades em /vendas: busca por identificador OU
 * nome do empreendimento (mesmo campo de texto, mesmo padrão da busca de
 * /vendas) + filtro por status_canonico, client-side sobre o universo
 * completo (até 3.300 linhas) já carregado pelo Server Component — sem
 * round-trip HTTP.
 */
export function useUnidadesListagem({ unidades }: UseUnidadesListagemParams) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusUnidadeFiltro>("");

  const termoBusca = useMemo(() => normalizarTexto(busca), [busca]);

  const unidadesFiltradas = useMemo(() => {
    return unidades.filter((u) => {
      if (status && u.status_canonico !== status) return false;
      if (termoBusca) {
        const alvo = normalizarTexto(
          `${u.identificador} ${u.empreendimento_nome}`,
        );
        if (!alvo.includes(termoBusca)) return false;
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
