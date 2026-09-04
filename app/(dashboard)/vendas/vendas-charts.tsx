"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";
import type { UnidadesPorStatus } from "@/lib/features/unidades/repository";

const vendasConfig: ChartConfig = {
  ativa: { label: "Ativas", color: "var(--chart-1)" },
  distrato: { label: "Distratadas", color: "var(--chart-2)" },
};

// Mesmo mapeamento de cor por status_canonico do gráfico de vendas
// (chart-1 = vendida, chart-2 = distrato) — vendida e ativa são o mesmo
// "estado positivo" em telas diferentes (unidades vs. vendas).
const unidadesConfig: ChartConfig = {
  vendida: { label: "Vendidas", color: "var(--chart-1)" },
  distrato: { label: "Distrato", color: "var(--chart-2)" },
  disponivel: { label: "Disponíveis", color: "var(--chart-3)" },
  reservada: { label: "Reservadas", color: "var(--chart-4)" },
};

interface VendasChartsProps {
  vendas: VendaListagemItem[];
  unidadesPorStatus: UnidadesPorStatus[];
}

// Gráficos derivados do universo COMPLETO carregado no servidor (não reagem
// à busca/filtros da listagem abaixo) — representam a proporção geral, não
// um recorte filtrado. Doughnut (não bar/area, ao contrário do /analitico):
// aqui o dado é proporção parte-todo, formato adequado a essa pergunta.
export function VendasCharts({ vendas, unidadesPorStatus }: VendasChartsProps) {
  const totalVendas = vendas.length;
  const ativas = vendas.filter((v) => v.status_canonico === "ativa").length;
  const distratadas = totalVendas - ativas;

  const dadosVendas = [
    { status: "ativa", total: ativas },
    { status: "distrato", total: distratadas },
  ];

  const totalUnidades = unidadesPorStatus.reduce((s, u) => s + u.total, 0);
  const dadosUnidades = unidadesPorStatus.map((u) => ({
    status: u.status_canonico,
    total: u.total,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vendas ativas vs. distratadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={vendasConfig}
            className="mx-auto aspect-square max-h-64"
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={dadosVendas}
                dataKey="total"
                nameKey="status"
                innerRadius={55}
                outerRadius={85}
                strokeWidth={2}
              >
                {dadosVendas.map((entrada) => (
                  <Cell
                    key={entrada.status}
                    fill={`var(--color-${entrada.status})`}
                  />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="status" />} />
            </PieChart>
          </ChartContainer>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {ativas} de {totalVendas} vendas ativas no total.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unidades por status</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={unidadesConfig}
            className="mx-auto aspect-square max-h-64"
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={dadosUnidades}
                dataKey="total"
                nameKey="status"
                innerRadius={55}
                outerRadius={85}
                strokeWidth={2}
              >
                {dadosUnidades.map((entrada) => (
                  <Cell
                    key={entrada.status}
                    fill={`var(--color-${entrada.status})`}
                  />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="status" />} />
            </PieChart>
          </ChartContainer>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {totalUnidades} unidades cadastradas no total.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
