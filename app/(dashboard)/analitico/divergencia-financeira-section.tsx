"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type {
  DivergenciaFinanceiraResumo,
  DivergenciaMensalItem,
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

const formatarMes = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });

const chartConfig: ChartConfig = {
  resultadoReportado: { label: "Resultado reportado", color: "var(--chart-1)" },
  resultadoRecalculado: {
    label: "Resultado recalculado",
    color: "var(--chart-4)",
  },
};

interface DivergenciaFinanceiraSectionProps {
  resumo: DivergenciaFinanceiraResumo;
  mensal: DivergenciaMensalItem[];
}

// Seletor de empreendimento é LOCAL a este gráfico (estado próprio, não
// afeta as perguntas 1/2/3). Gráfico começa vazio — nenhum default, nem o
// de maior divergência — só renderiza depois da primeira escolha do
// usuário.
export function DivergenciaFinanceiraSection({
  resumo,
  mensal,
}: DivergenciaFinanceiraSectionProps) {
  const [empreendimentoId, setEmpreendimentoId] = useState<string>("");

  const {
    totalMeses,
    totalDivergentes,
    totalEmpreendimentosDivergentes,
    somaAbsDiferencas,
    porEmpreendimento,
  } = resumo;

  // Opções ordenadas por soma de diferença absoluta desc (já vem assim do
  // repository) — ajuda a achar rápido quem mais diverge, mas nada é
  // selecionado por padrão.
  const opcoes = porEmpreendimento;

  const serie = useMemo(() => {
    if (!empreendimentoId) return [];
    const id = Number(empreendimentoId);
    return mensal
      .filter((m) => m.empreendimentoId === id)
      .sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia))
      .map((m) => ({
        mes: formatarMes(m.mesReferencia),
        resultadoReportado: Math.round(m.resultadoReportado),
        resultadoRecalculado: Math.round(m.resultadoRecalculado),
      }));
  }, [mensal, empreendimentoId]);

  const empreendimentoSelecionado = opcoes.find(
    (o) => String(o.empreendimentoId) === empreendimentoId,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Divergência financeira</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Resultado recalculado = receita reconhecida − custo incorrido −
          despesas corporativas rateadas. Meses cuja diferença para o valor
          reportado ultrapassa R$ 0,01 são marcados como divergentes. Não foi
          encontrado padrão sistemático (a divergência não é sempre no mesmo
          sentido) — tratado como hipótese de erro de lançamento pontual, não
          regra de negócio não capturada pela fórmula.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-muted-foreground">
              Meses divergentes
            </p>
            <p className="text-lg font-semibold">
              {totalDivergentes} / {totalMeses}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-muted-foreground">
              Empreendimentos afetados
            </p>
            <p className="text-lg font-semibold">
              {totalEmpreendimentosDivergentes}
            </p>
          </div>
          <div className="col-span-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-muted-foreground">
              Soma das diferenças (absoluta)
            </p>
            <p className="text-lg font-semibold">
              {formatarValor(somaAbsDiferencas)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1 sm:w-72">
          <Label htmlFor="divergencia-filtro-empreendimento">
            Empreendimento
          </Label>
          <Select
            id="divergencia-filtro-empreendimento"
            value={empreendimentoId}
            onChange={(e) => setEmpreendimentoId(e.target.value)}
          >
            <option value="" disabled>
              Selecione um empreendimento
            </option>
            {opcoes.map((o) => (
              <option key={o.empreendimentoId} value={o.empreendimentoId}>
                {o.nome} ({o.mesesDivergentes} meses divergentes)
              </option>
            ))}
          </Select>
        </div>

        {!empreendimentoId ? (
          <p className="text-base text-muted-foreground">
            Selecione um empreendimento acima para ver a série temporal de
            resultado reportado vs. recalculado.
          </p>
        ) : serie.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Nenhum dado financeiro para este empreendimento.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-64 w-full sm:h-72"
            >
              <AreaChart data={serie} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={formatarValorCurto}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>
                          {chartConfig[name as string]?.label ?? name}:{" "}
                          {formatarValor(Number(value))}
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="resultadoReportado"
                  type="monotone"
                  fill="var(--color-resultadoReportado)"
                  stroke="var(--color-resultadoReportado)"
                  fillOpacity={0.35}
                />
                <Area
                  dataKey="resultadoRecalculado"
                  type="monotone"
                  fill="var(--color-resultadoRecalculado)"
                  stroke="var(--color-resultadoRecalculado)"
                  fillOpacity={0.35}
                />
              </AreaChart>
            </ChartContainer>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: "var(--chart-1)" }}
                />
                Reportado
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: "var(--chart-4)" }}
                />
                Recalculado
              </span>
            </div>
            {empreendimentoSelecionado && (
              <p className="text-sm text-muted-foreground">
                {empreendimentoSelecionado.nome}:{" "}
                {empreendimentoSelecionado.mesesDivergentes} de{" "}
                {empreendimentoSelecionado.mesesTotal} meses divergentes,{" "}
                {formatarValor(empreendimentoSelecionado.somaAbsDiferenca)} em
                diferenças absolutas — onde as duas áreas do gráfico não
                coincidem, esse é o mês divergente.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
