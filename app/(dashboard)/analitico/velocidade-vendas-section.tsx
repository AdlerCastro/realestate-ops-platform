import { cn } from "@/lib/utils";
import type { VelocidadeVendasItem } from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatarPercentual = (fracao: number) =>
  fracao.toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatarData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

interface VelocidadeVendasSectionProps {
  itens: VelocidadeVendasItem[];
}

// Lista já vem ordenada pior -> melhor (velocidade ASC) do repository. Os 3
// primeiros (piores) recebem destaque visual, conforme pedido da sessão.
export function VelocidadeVendasSection({
  itens,
}: VelocidadeVendasSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Velocidade de vendas por empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Numerador = unidades com status normalizado &quot;vendida&quot; (já
          líquido de distrato — uma unidade cancelada volta para
          &quot;distrato&quot;, não &quot;vendida&quot;). Denominador = todas as
          unidades cadastradas no empreendimento, sem exclusão por status. Os 3
          piores colocados são, sem exceção, os empreendimentos mais
          recentemente lançados — a métrica é de estoque, não normalizada pelo
          tempo desde o lançamento.
        </p>

        {/* Mobile-first: lista empilhada por padrão; tabela a partir de md. */}
        <ol className="flex flex-col gap-2 md:hidden">
          {itens.map((item, index) => (
            <li
              key={item.empreendimentoId}
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-border p-3",
                index < 3 && "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {index < 3 ? `${index + 1}º pior · ` : ""}
                  {item.nome}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    index < 3 && "text-destructive",
                  )}
                >
                  {formatarPercentual(item.velocidade)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {item.vendidas} de {item.totalOfertado} unidades vendidas ·
                lançamento em {formatarData(item.dataLancamento)}
              </span>
            </li>
          ))}
        </ol>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Empreendimento</th>
                <th className="py-2 pr-4 font-medium">Vendidas</th>
                <th className="py-2 pr-4 font-medium">Total ofertado</th>
                <th className="py-2 pr-4 font-medium">Velocidade</th>
                <th className="py-2 pr-0 font-medium">Lançamento</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => (
                <tr
                  key={item.empreendimentoId}
                  className={cn(
                    "border-b border-border last:border-0",
                    index < 3 && "bg-destructive/5",
                  )}
                >
                  <td className="py-2 pr-4 font-medium">
                    {index < 3 ? (
                      <span className="text-destructive">{index + 1}º</span>
                    ) : (
                      index + 1
                    )}
                  </td>
                  <td className="py-2 pr-4">{item.nome}</td>
                  <td className="py-2 pr-4">{item.vendidas}</td>
                  <td className="py-2 pr-4">{item.totalOfertado}</td>
                  <td
                    className={cn(
                      "py-2 pr-4 font-semibold",
                      index < 3 && "text-destructive",
                    )}
                  >
                    {formatarPercentual(item.velocidade)}
                  </td>
                  <td className="py-2 pr-0">
                    {formatarData(item.dataLancamento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
