"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formaPagamentoEnum } from "@/lib/features/vendas/schema";
import type { FormaPagamentoFiltro } from "@/lib/features/vendas/hooks/use-vendas-listagem";

interface VendasFiltrosProps {
  busca: string;
  onBuscaChange: (valor: string) => void;
  formaPagamento: FormaPagamentoFiltro | "";
  onFormaPagamentoChange: (valor: FormaPagamentoFiltro | "") => void;
  dataVendaDe: string;
  onDataVendaDeChange: (valor: string) => void;
  dataVendaAte: string;
  onDataVendaAteChange: (valor: string) => void;
  dataDistratoDe: string;
  onDataDistratoDeChange: (valor: string) => void;
  dataDistratoAte: string;
  onDataDistratoAteChange: (valor: string) => void;
  onLimpar: () => void;
}

export function VendasFiltros({
  busca,
  onBuscaChange,
  formaPagamento,
  onFormaPagamentoChange,
  dataVendaDe,
  onDataVendaDeChange,
  dataVendaAte,
  onDataVendaAteChange,
  dataDistratoDe,
  onDataDistratoDeChange,
  dataDistratoAte,
  onDataDistratoAteChange,
  onLimpar,
}: VendasFiltrosProps) {
  const buscaId = useId();
  const formaPagamentoId = useId();
  const dataVendaDeId = useId();
  const dataVendaAteId = useId();
  const dataDistratoDeId = useId();
  const dataDistratoAteId = useId();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={buscaId}>Buscar por cliente ou unidade</Label>
          <Input
            id={buscaId}
            type="text"
            placeholder="Nome do cliente, empreendimento ou identificador"
            value={busca}
            onChange={(event) => onBuscaChange(event.target.value)}
          />
        </div>

        {/* Mobile-first: filtros empilhados por padrão, grid a partir de md. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={formaPagamentoId}>Forma de pagamento</Label>
            <Select
              id={formaPagamentoId}
              value={formaPagamento}
              onChange={(event) =>
                onFormaPagamentoChange(
                  event.target.value as FormaPagamentoFiltro | "",
                )
              }
            >
              <option value="">Todas</option>
              {formaPagamentoEnum.options.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dataVendaDeId}>Venda de</Label>
            <Input
              id={dataVendaDeId}
              type="date"
              value={dataVendaDe}
              onChange={(event) => onDataVendaDeChange(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dataVendaAteId}>Venda até</Label>
            <Input
              id={dataVendaAteId}
              type="date"
              value={dataVendaAte}
              onChange={(event) => onDataVendaAteChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dataDistratoDeId}>Distrato de</Label>
            <Input
              id={dataDistratoDeId}
              type="date"
              value={dataDistratoDe}
              onChange={(event) => onDataDistratoDeChange(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dataDistratoAteId}>Distrato até</Label>
            <Input
              id={dataDistratoAteId}
              type="date"
              value={dataDistratoAte}
              onChange={(event) => onDataDistratoAteChange(event.target.value)}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onLimpar}
        >
          Limpar filtros
        </Button>
      </CardContent>
    </Card>
  );
}
