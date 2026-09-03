import { cn } from "@/lib/utils";
import type { RiscoEstouroCustoItem } from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface RiscoEstouroCustoSectionProps {
  itens: RiscoEstouroCustoItem[];
}

const TOP_N = 5;

function LinhaEstouro({
  item,
  destaque,
}: {
  item: RiscoEstouroCustoItem;
  destaque: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border p-3",
        destaque && "border-accent bg-accent/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{item.nome}</span>
        <span className="text-sm font-semibold">
          {formatarValor(item.magnitudeEstouroAcumulada)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {item.mesesComEstouro} de {item.mesesTotal} meses com estouro
      </span>
      <span className="text-xs text-muted-foreground/70">
        Desvio líquido (referência):{" "}
        {formatarValor(item.desvioLiquidoReferencia)}
      </span>
    </div>
  );
}

// Lista já vem ordenada por magnitude bruta DESC do repository — a
// ordenação em si não é decisão desta camada, só o recorte de exibição.
export function RiscoEstouroCustoSection({
  itens,
}: RiscoEstouroCustoSectionProps) {
  const top = itens.slice(0, TOP_N);
  const restante = itens.slice(TOP_N);

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Risco de estouro de custo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Magnitude acumulada = soma apenas dos meses em que o custo realizado
          superou o orçado (critério bruto), não a soma líquida do período. Um
          projeto pode ter estouros grandes em alguns meses compensados por
          economia em outros — o desvio líquido (exibido como referência
          secundária) esconderia esse risco.
        </p>

        <div className="flex flex-col gap-2">
          {top.map((item) => (
            <LinhaEstouro key={item.empreendimentoId} item={item} destaque />
          ))}
        </div>

        {restante.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Ver os demais {restante.length} empreendimentos
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {restante.map((item) => (
                <LinhaEstouro
                  key={item.empreendimentoId}
                  item={item}
                  destaque={false}
                />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
