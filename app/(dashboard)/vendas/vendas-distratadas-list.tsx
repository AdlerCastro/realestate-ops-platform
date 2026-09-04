import { Card, CardContent } from "@/components/ui/card";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

interface VendasDistratadasListProps {
  vendas: VendaListagemItem[];
}

// Sem ação (não é possível reverter distrato nesta aplicação — fora do
// escopo do enunciado). data-testid usa prefixo "distrato-" (não "venda-")
// de propósito: o teste E2E persistido (tests/e2e/vendas-distratos.spec.ts)
// espera `getByTestId("venda-<id>")` com contagem 0 imediatamente após um
// distrato — reusar o mesmo prefixo aqui faria essa linha (que passa a
// existir nesta tabela após o distrato) quebrar aquela asserção.
export function VendasDistratadasList({ vendas }: VendasDistratadasListProps) {
  if (vendas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma venda distratada encontrada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-112 overflow-y-auto md:hidden">
        <div className="flex flex-col gap-2">
          {vendas.map((venda) => (
            <Card key={venda.id} size="sm" data-testid={`distrato-${venda.id}`}>
              <CardContent className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {venda.empreendimento_nome} — {venda.unidade_identificador}
                </p>
                <p className="text-sm text-muted-foreground">
                  {venda.cliente_nome}
                </p>
                <p className="text-sm">
                  {formatarValor(venda.valor_venda)} · {venda.forma_pagamento}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vendida em {formatarData(venda.data_venda)}
                  {venda.data_distrato
                    ? ` · Distratada em ${formatarData(venda.data_distrato)}`
                    : ""}
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
              <th className="py-2 pr-4 font-medium">Cliente</th>
              <th className="py-2 pr-4 font-medium">Valor</th>
              <th className="py-2 pr-4 font-medium">Pagamento</th>
              <th className="py-2 pr-4 font-medium">Data da venda</th>
              <th className="py-2 pr-0 font-medium">Data do distrato</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((venda) => (
              <tr
                key={venda.id}
                data-testid={`distrato-${venda.id}`}
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
                  {venda.data_distrato
                    ? formatarData(venda.data_distrato)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
