"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDistrato } from "@/lib/features/vendas/hooks/use-distrato";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

interface VendasAtivasListProps {
  vendas: VendaListagemItem[];
}

export function VendasAtivasList({ vendas }: VendasAtivasListProps) {
  const { distratar, vendaIdEmAndamento, isPending, erro, vendaComErro } =
    useDistrato();

  if (vendas.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        Nenhuma venda ativa encontrada.
      </p>
    );
  }

  return (
    // Altura fixa + scroll interno (não a página inteira) — mobile-first,
    // limite menor no viewport base (cards são mais altos que linhas de
    // tabela) e maior a partir de md.
    <div className="flex flex-col gap-3">
      <div className="max-h-112 overflow-y-auto md:hidden">
        <div className="flex flex-col gap-2">
          {vendas.map((venda) => (
            <Card key={venda.id} size="sm" data-testid={`venda-${venda.id}`}>
              <CardContent className="flex flex-col gap-1">
                <p className="text-base font-medium">
                  {venda.empreendimento_nome} — {venda.unidade_identificador}
                </p>
                <p className="text-base text-muted-foreground">
                  {venda.cliente_nome}
                </p>
                <p className="text-base">
                  {formatarValor(venda.valor_venda)} · {venda.forma_pagamento}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vendida em {formatarData(venda.data_venda)}
                </p>
                {vendaComErro === venda.id && erro ? (
                  <p role="alert" className="text-base text-destructive">
                    {erro}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="mt-1 self-start"
                  disabled={isPending && vendaIdEmAndamento === venda.id}
                  onClick={() => distratar(venda.id)}
                >
                  {isPending && vendaIdEmAndamento === venda.id
                    ? "Distratando..."
                    : "Distratar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="hidden max-h-128 overflow-y-auto md:block">
        <table className="w-full text-left text-base">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Unidade</th>
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Valor</th>
              <th className="py-2 pr-4 font-medium">Pagamento</th>
              <th className="py-2 pr-4 font-medium">Data</th>
              <th className="py-2 pr-0 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((venda) => (
              <tr
                key={venda.id}
                data-testid={`venda-${venda.id}`}
                className="border-b border-border last:border-0"
              >
                <td className="py-2 pr-4">
                  {venda.empreendimento_nome} — {venda.unidade_identificador}
                </td>
                <td className="py-2 pr-4">{venda.cliente_nome}</td>
                <td className="py-2 pr-4">
                  {formatarValor(venda.valor_venda)}
                </td>
                <td className="py-2 pr-4">{venda.forma_pagamento}</td>
                <td className="py-2 pr-4">{formatarData(venda.data_venda)}</td>
                <td className="py-2 pr-0">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isPending && vendaIdEmAndamento === venda.id}
                    onClick={() => distratar(venda.id)}
                  >
                    {isPending && vendaIdEmAndamento === venda.id
                      ? "Distratando..."
                      : "Distratar"}
                  </Button>
                  {vendaComErro === venda.id && erro ? (
                    <p role="alert" className="mt-1 text-base text-destructive">
                      {erro}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
