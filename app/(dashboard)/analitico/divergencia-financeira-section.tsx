import type {
  DivergenciaEmpreendimentoItem,
  DivergenciaFinanceiraResumo,
} from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LIMITE_INICIAL = 8;

interface DivergenciaFinanceiraSectionProps {
  resumo: DivergenciaFinanceiraResumo;
}

function ListaDivergencia({
  itens,
}: {
  itens: DivergenciaEmpreendimentoItem[];
}) {
  return (
    <>
      {/* Mobile-first: lista empilhada por padrão; tabela a partir de md. */}
      <ol className="flex flex-col gap-2 md:hidden">
        {itens.map((item) => (
          <li
            key={item.empreendimentoId}
            className="flex flex-col gap-1 rounded-lg border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{item.nome}</span>
              <span className="text-sm font-semibold">
                {formatarValor(item.somaAbsDiferenca)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {item.mesesDivergentes} de {item.mesesTotal} meses divergentes
            </span>
          </li>
        ))}
      </ol>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Empreendimento</th>
              <th className="py-2 pr-4 font-medium">Meses divergentes</th>
              <th className="py-2 pr-0 font-medium">Soma abs. diferença</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={item.empreendimentoId}
                className="border-b border-border last:border-0"
              >
                <td className="py-2 pr-4">{item.nome}</td>
                <td className="py-2 pr-4">
                  {item.mesesDivergentes} / {item.mesesTotal}
                </td>
                <td className="py-2 pr-0 font-medium">
                  {formatarValor(item.somaAbsDiferenca)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// porEmpreendimento já vem ordenado por somaAbsDiferenca DESC do
// repository, incluindo os empreendimentos sem nenhum mês divergente
// (zero) — só o recorte inicial de exibição no mobile é decisão do front.
export function DivergenciaFinanceiraSection({
  resumo,
}: DivergenciaFinanceiraSectionProps) {
  const {
    totalMeses,
    totalDivergentes,
    totalEmpreendimentosDivergentes,
    somaAbsDiferencas,
    porEmpreendimento,
  } = resumo;

  const visiveis = porEmpreendimento.slice(0, LIMITE_INICIAL);
  const restante = porEmpreendimento.slice(LIMITE_INICIAL);

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Divergência financeira</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Resultado recalculado = receita reconhecida − custo incorrido −
          despesas corporativas rateadas. Meses cuja diferença para o valor
          reportado ultrapassa R$ 0,01 são marcados como divergentes. Não foi
          encontrado padrão sistemático (a divergência não é sempre no mesmo
          sentido) — tratado como hipótese de erro de lançamento pontual, não
          regra de negócio não capturada pela fórmula.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Meses divergentes
            </p>
            <p className="text-lg font-semibold">
              {totalDivergentes} / {totalMeses}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Empreendimentos afetados
            </p>
            <p className="text-lg font-semibold">
              {totalEmpreendimentosDivergentes}
            </p>
          </div>
          <div className="col-span-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Soma das diferenças (absoluta)
            </p>
            <p className="text-lg font-semibold">
              {formatarValor(somaAbsDiferencas)}
            </p>
          </div>
        </div>

        <ListaDivergencia itens={visiveis} />

        {restante.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Ver mais {restante.length} empreendimentos
            </summary>
            <div className="mt-2">
              <ListaDivergencia itens={restante} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
