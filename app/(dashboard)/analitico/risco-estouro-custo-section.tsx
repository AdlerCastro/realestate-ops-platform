"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

import type {
  EstouroCustoMensalItem,
  RiscoEstouroCustoItem,
} from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarValorCurto = (valor: number) =>
  `${valor < 0 ? "-" : ""}R$${(Math.abs(valor) / 1_000_000).toFixed(1)}M`;

const TOP_N = 5;

type Periodo = "todos" | "6" | "12" | "24";

interface Filtros {
  cidade: string;
  uf: string;
  tipo: string;
  periodo: Periodo;
}

const FILTROS_VAZIOS: Filtros = {
  cidade: "",
  uf: "",
  tipo: "",
  periodo: "todos",
};

function opcoesUnicas(
  itens: EstouroCustoMensalItem[],
  campo: "cidade" | "uf" | "tipo",
) {
  return Array.from(new Set(itens.map((i) => i[campo]))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

// mes_referencia é 'YYYY-MM-01', comparável lexicograficamente com a mesma
// formatação — sem necessidade de biblioteca de data.
function dataCorte(periodo: Periodo): string | null {
  if (periodo === "todos") return null;
  const meses = Number(periodo);
  const agora = new Date();
  agora.setDate(1);
  agora.setMonth(agora.getMonth() - meses);
  return agora.toISOString().slice(0, 7) + "-01";
}

// Agregação client-side (critério bruto = decisão B3): a fórmula em si
// (soma só dos meses com estouro para o critério de ordenação) nunca muda —
// o que muda com o filtro é só o subconjunto de linhas mensais somadas.
function agregar(rows: EstouroCustoMensalItem[]): RiscoEstouroCustoItem[] {
  const porEmpreendimento = new Map<
    number,
    {
      nome: string;
      magnitude: number;
      liquido: number;
      comEstouro: number;
      total: number;
    }
  >();

  for (const row of rows) {
    const atual = porEmpreendimento.get(row.empreendimentoId) ?? {
      nome: row.nome,
      magnitude: 0,
      liquido: 0,
      comEstouro: 0,
      total: 0,
    };
    const desvio = row.custoRealizado - row.custoOrcado;
    atual.magnitude += desvio > 0 ? desvio : 0;
    atual.liquido += desvio;
    atual.comEstouro += desvio > 0 ? 1 : 0;
    atual.total += 1;
    porEmpreendimento.set(row.empreendimentoId, atual);
  }

  return Array.from(porEmpreendimento.entries())
    .map(([empreendimentoId, v]) => ({
      empreendimentoId,
      nome: v.nome,
      magnitudeEstouroAcumulada: v.magnitude,
      desvioLiquidoReferencia: v.liquido,
      mesesComEstouro: v.comEstouro,
      mesesTotal: v.total,
    }))
    .sort((a, b) => b.magnitudeEstouroAcumulada - a.magnitudeEstouroAcumulada);
}

interface RiscoEstouroCustoSectionProps {
  itens: EstouroCustoMensalItem[];
}

const chartConfig: ChartConfig = {
  magnitudeEstouroAcumulada: {
    label: "Magnitude de estouro (bruta)",
    color: "var(--chart-1)",
  },
  desvioLiquidoReferencia: {
    label: "Desvio líquido (referência)",
    color: "var(--chart-3)",
  },
};

// Filtros (cidade/uf/tipo/período) são estado local — mudam só o
// subconjunto de meses considerado na soma, nunca o critério da regra B3
// (soma bruta dos meses com estouro > soma líquida).
export function RiscoEstouroCustoSection({
  itens,
}: RiscoEstouroCustoSectionProps) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);

  const opcoesCidade = useMemo(() => opcoesUnicas(itens, "cidade"), [itens]);
  const opcoesUf = useMemo(() => opcoesUnicas(itens, "uf"), [itens]);
  const opcoesTipo = useMemo(() => opcoesUnicas(itens, "tipo"), [itens]);

  const linhasFiltradas = useMemo(() => {
    const corte = dataCorte(filtros.periodo);
    return itens.filter(
      (item) =>
        (!filtros.cidade || item.cidade === filtros.cidade) &&
        (!filtros.uf || item.uf === filtros.uf) &&
        (!filtros.tipo || item.tipo === filtros.tipo) &&
        (!corte || item.mesReferencia >= corte),
    );
  }, [itens, filtros]);

  const agregado = useMemo(() => agregar(linhasFiltradas), [linhasFiltradas]);

  const top5 = agregado.slice(0, TOP_N);
  // Cume Tower é a evidência usada no texto de apoio (regra B3) — deve
  // aparecer no conjunto exibido mesmo se cair fora do top-5 nominal, desde
  // que ainda esteja presente no subconjunto filtrado. Se o filtro excluir
  // o empreendimento de fato (nenhuma linha dele no subconjunto), ele não
  // aparece em `agregado` e o texto de apoio se ajusta sozinho abaixo.
  const cumeTower = agregado.find((a) => a.nome === "Cume Tower");
  const conjuntoExibido =
    cumeTower &&
    !top5.some((t) => t.empreendimentoId === cumeTower.empreendimentoId)
      ? [...top5, cumeTower]
      : top5;

  const data = conjuntoExibido.map((item) => ({
    nome: item.nome,
    magnitudeEstouroAcumulada: Math.round(item.magnitudeEstouroAcumulada),
    desvioLiquidoReferencia: Math.round(item.desvioLiquidoReferencia),
    mesesComEstouro: item.mesesComEstouro,
    mesesTotal: item.mesesTotal,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Risco de estouro de custo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Magnitude acumulada (barra 1) = soma apenas dos meses em que o custo
          realizado superou o orçado no subconjunto filtrado (critério bruto,
          regra B3) — critério de ordenação (top-5). Desvio líquido (barra 2) =
          soma líquida do mesmo subconjunto, exibida só como referência
          secundária, nunca usada para ordenar.
          {cumeTower ? (
            <>
              {" "}
              Cume Tower é a evidência dessa escolha: no subconjunto filtrado
              atual, magnitude bruta{" "}
              {formatarValor(cumeTower.magnitudeEstouroAcumulada)} vs. desvio
              líquido {formatarValor(cumeTower.desvioLiquidoReferencia)} — pelo
              critério líquido, meses de estouro e de economia se cancelam e
              esconderiam esse risco do ranking.
            </>
          ) : (
            <>
              {" "}
              (Cume Tower, o exemplo de referência da regra B3, não está no
              subconjunto filtrado atual.)
            </>
          )}
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="estouro-filtro-cidade">Cidade</Label>
            <Select
              id="estouro-filtro-cidade"
              value={filtros.cidade}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, cidade: e.target.value }))
              }
            >
              <option value="">Todas</option>
              {opcoesCidade.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="estouro-filtro-uf">UF</Label>
            <Select
              id="estouro-filtro-uf"
              value={filtros.uf}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, uf: e.target.value }))
              }
            >
              <option value="">Todas</option>
              {opcoesUf.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="estouro-filtro-tipo">Tipo</Label>
            <Select
              id="estouro-filtro-tipo"
              value={filtros.tipo}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, tipo: e.target.value }))
              }
            >
              <option value="">Todos</option>
              {opcoesTipo.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="estouro-filtro-periodo">Período</Label>
            <Select
              id="estouro-filtro-periodo"
              value={filtros.periodo}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  periodo: e.target.value as Periodo,
                }))
              }
            >
              <option value="todos">Todo o período</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Últimos 12 meses</option>
              <option value="24">Últimos 24 meses</option>
            </Select>
          </div>
        </div>

        {data.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Nenhum empreendimento no subconjunto filtrado.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-64 w-full sm:h-72"
          >
            <BarChart data={data} layout="vertical" margin={{ left: 0 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={formatarValorCurto}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="nome"
                tickLine={false}
                axisLine={false}
                width={110}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatarValor(Number(value))}
                  />
                }
              />
              <Legend
                content={() => (
                  <div className="flex items-center justify-center gap-4 pt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-[2px]"
                        style={{ backgroundColor: "var(--chart-1)" }}
                      />
                      Magnitude bruta
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-[2px]"
                        style={{ backgroundColor: "var(--chart-3)" }}
                      />
                      Desvio líquido (ref.)
                    </span>
                  </div>
                )}
              />
              <Bar
                dataKey="magnitudeEstouroAcumulada"
                fill="var(--color-magnitudeEstouroAcumulada)"
                radius={4}
              />
              <Bar
                dataKey="desvioLiquidoReferencia"
                fill="var(--color-desvioLiquidoReferencia)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}

        <p className="text-sm text-muted-foreground">
          {agregado.length} de{" "}
          {new Set(itens.map((i) => i.empreendimentoId)).size} empreendimentos
          no subconjunto filtrado atual.
        </p>
      </CardContent>
    </Card>
  );
}
