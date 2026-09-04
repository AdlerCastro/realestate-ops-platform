"use client";

import { useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUnidadesListagem } from "@/lib/features/unidades/hooks/use-unidades-listagem";
import type { UnidadeListagemItem } from "@/lib/features/unidades/repository";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarArea = (area: number) =>
  `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

const STATUS_LABEL: Record<UnidadeListagemItem["status_canonico"], string> = {
  vendida: "Vendida",
  disponivel: "Disponível",
  reservada: "Reservada",
  distrato: "Distrato",
};

interface UnidadesListProps {
  unidades: UnidadeListagemItem[];
}

// Tabela somente leitura — sem ação de venda/distrato aqui (já existe em
// /vendas/novo e nos botões de distratar das tabs acima). Volume de até
// 3.300 linhas, mesmo padrão client-side (altura fixa + scroll interno,
// sem paginação server-side) já usado para as 2.206 vendas.
export function UnidadesList({ unidades }: UnidadesListProps) {
  const buscaId = useId();
  const statusId = useId();
  const vm = useUnidadesListagem({ unidades });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Unidades ({vm.unidadesFiltradas.length} de {unidades.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={buscaId}>
              Buscar por identificador ou empreendimento
            </Label>
            <Input
              id={buscaId}
              type="text"
              placeholder="Identificador ou nome do empreendimento"
              value={vm.busca}
              onChange={(event) => vm.setBusca(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={statusId}>Status</Label>
            <Select
              id={statusId}
              value={vm.status}
              onChange={(event) =>
                vm.setStatus(
                  event.target.value as
                    UnidadeListagemItem["status_canonico"] | "",
                )
              }
            >
              <option value="">Todos</option>
              {(
                Object.keys(STATUS_LABEL) as Array<
                  UnidadeListagemItem["status_canonico"]
                >
              ).map((opcao) => (
                <option key={opcao} value={opcao}>
                  {STATUS_LABEL[opcao]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {vm.unidadesFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma unidade encontrada.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="max-h-112 overflow-y-auto md:hidden">
              <div className="flex flex-col gap-2">
                {vm.unidadesFiltradas.map((unidade) => (
                  <Card key={unidade.id} size="sm">
                    <CardContent className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {unidade.empreendimento_nome} — {unidade.identificador}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {unidade.tipo} ·{" "}
                        {formatarArea(unidade.area_privativa_m2)}
                      </p>
                      <p className="text-sm">
                        {formatarValor(unidade.valor_tabela)} ·{" "}
                        {STATUS_LABEL[unidade.status_canonico]}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="hidden max-h-128 overflow-y-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Unidade</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Área</th>
                    <th className="py-2 pr-4 font-medium">Valor de tabela</th>
                    <th className="py-2 pr-0 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.unidadesFiltradas.map((unidade) => (
                    <tr
                      key={unidade.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-4">
                        {unidade.empreendimento_nome} — {unidade.identificador}
                      </td>
                      <td className="py-2 pr-4">{unidade.tipo}</td>
                      <td className="py-2 pr-4">
                        {formatarArea(unidade.area_privativa_m2)}
                      </td>
                      <td className="py-2 pr-4">
                        {formatarValor(unidade.valor_tabela)}
                      </td>
                      <td className="py-2 pr-0">
                        {STATUS_LABEL[unidade.status_canonico]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
