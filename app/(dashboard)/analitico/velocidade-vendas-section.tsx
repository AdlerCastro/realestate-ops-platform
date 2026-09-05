"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { VelocidadeVendasItem } from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface VelocidadeVendasSectionProps {
  itens: VelocidadeVendasItem[];
}

interface Filtros {
  cidade: string;
  uf: string;
  tipo: string;
}

const FILTROS_VAZIOS: Filtros = { cidade: "", uf: "", tipo: "" };

function opcoesUnicas(
  itens: VelocidadeVendasItem[],
  campo: "cidade" | "uf" | "tipo",
) {
  return Array.from(new Set(itens.map((i) => i[campo]))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function GraficoVelocidade({
  itens,
  cor,
  chartId,
}: {
  itens: VelocidadeVendasItem[];
  cor: string;
  chartId: string;
}) {
  const data = itens.map((item) => ({
    nome: item.nome,
    velocidadePct: Math.round(item.velocidade * 10000) / 100,
    vendidas: item.vendidas,
    totalOfertado: item.totalOfertado,
  }));

  const config: ChartConfig = {
    velocidadePct: { label: "Velocidade de vendas", color: cor },
  };

  if (data.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        Nenhum empreendimento no subconjunto filtrado.
      </p>
    );
  }

  return (
    <ChartContainer
      id={chartId}
      config={config}
      className="aspect-auto h-[9rem] w-full sm:h-40"
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          dataKey="velocidadePct"
          tickFormatter={(v: number) => `${v}%`}
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
              formatter={(value, _name, item) => {
                const payload = item.payload as {
                  vendidas: number;
                  totalOfertado: number;
                };
                return (
                  <span>
                    {String(value)}% ({payload.vendidas}/{payload.totalOfertado}{" "}
                    unidades)
                  </span>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="velocidadePct"
          fill={`var(--color-velocidadePct)`}
          radius={4}
        />
      </BarChart>
    </ChartContainer>
  );
}

// Filtros são estado local (useState), sem sincronizar com URL — mudam só o
// que é exibido (subconjunto de empreendimentos), nunca a fórmula da
// velocidade (numerador/denominador continuam status_canonico='vendida' /
// todas as unidades, regra B2, calculados no repository). Nenhum filtro
// aqui incide sobre status_canonico.
export function VelocidadeVendasSection({
  itens,
}: VelocidadeVendasSectionProps) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);

  const opcoesCidade = useMemo(() => opcoesUnicas(itens, "cidade"), [itens]);
  const opcoesUf = useMemo(() => opcoesUnicas(itens, "uf"), [itens]);
  const opcoesTipo = useMemo(() => opcoesUnicas(itens, "tipo"), [itens]);

  const filtrados = useMemo(
    () =>
      itens.filter(
        (item) =>
          (!filtros.cidade || item.cidade === filtros.cidade) &&
          (!filtros.uf || item.uf === filtros.uf) &&
          (!filtros.tipo || item.tipo === filtros.tipo),
      ),
    [itens, filtros],
  );

  // itens já vem ordenado por velocidade ASC (pior primeiro) do repository —
  // recalculado sobre o subconjunto filtrado a cada mudança de filtro.
  const piores3 = filtrados.slice(0, 3);
  const melhores3 = [...filtrados].reverse().slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Velocidade de vendas por empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Numerador = unidades com status normalizado &quot;vendida&quot; (já
          líquido de distrato — uma unidade cancelada volta para
          &quot;distrato&quot;, não &quot;vendida&quot;). Denominador = todas as
          unidades cadastradas no empreendimento, sem exclusão por status. Os
          filtros abaixo mudam só o subconjunto exibido — nunca essa fórmula.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="velocidade-filtro-cidade">Cidade</Label>
            <Select
              id="velocidade-filtro-cidade"
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
            <Label htmlFor="velocidade-filtro-uf">UF</Label>
            <Select
              id="velocidade-filtro-uf"
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
            <Label htmlFor="velocidade-filtro-tipo">Tipo</Label>
            <Select
              id="velocidade-filtro-tipo"
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
        </div>

        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Limitação conhecida da métrica (regra B2 em regras-de-negocio.md):
          tanto os piores quanto os melhores extremos de velocidade tendem a
          coincidir com o tempo desde o lançamento do empreendimento — a métrica
          não é normalizada por tempo em estoque. Isso vale para as duas seções
          abaixo, não é um artefato de bug.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-medium text-destructive">3 piores</h3>
            <GraficoVelocidade
              itens={piores3}
              cor="var(--destructive)"
              chartId="velocidade-piores"
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-medium">3 melhores</h3>
            <GraficoVelocidade
              itens={melhores3}
              cor="var(--accent)"
              chartId="velocidade-melhores"
            />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {filtrados.length} de {itens.length} empreendimentos no subconjunto
          filtrado atual.
        </p>
      </CardContent>
    </Card>
  );
}
