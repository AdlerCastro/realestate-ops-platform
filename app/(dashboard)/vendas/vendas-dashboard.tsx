"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVendasListagem } from "@/lib/features/vendas/hooks/use-vendas-listagem";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";
import type { UnidadesPorStatus } from "@/lib/features/unidades/repository";
import { VendasCharts } from "./vendas-charts";
import { VendasFiltros } from "./vendas-filtros";
import { VendasAtivasList } from "./vendas-ativas-list";
import { VendasDistratadasList } from "./vendas-distratadas-list";

interface VendasDashboardProps {
  vendas: VendaListagemItem[];
  unidadesPorStatus: UnidadesPorStatus[];
}

export function VendasDashboard({
  vendas,
  unidadesPorStatus,
}: VendasDashboardProps) {
  const vm = useVendasListagem({ vendas });

  return (
    <div className="flex flex-col gap-4">
      <VendasCharts vendas={vendas} unidadesPorStatus={unidadesPorStatus} />

      <VendasFiltros
        busca={vm.busca}
        onBuscaChange={vm.setBusca}
        formaPagamento={vm.formaPagamento}
        onFormaPagamentoChange={vm.setFormaPagamento}
        dataVendaDe={vm.dataVendaDe}
        onDataVendaDeChange={vm.setDataVendaDe}
        dataVendaAte={vm.dataVendaAte}
        onDataVendaAteChange={vm.setDataVendaAte}
        dataDistratoDe={vm.dataDistratoDe}
        onDataDistratoDeChange={vm.setDataDistratoDe}
        dataDistratoAte={vm.dataDistratoAte}
        onDataDistratoAteChange={vm.setDataDistratoAte}
        onLimpar={vm.limparFiltros}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vendas ativas ({vm.vendasAtivas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VendasAtivasList vendas={vm.vendasAtivas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vendas distratadas ({vm.vendasDistratadas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VendasDistratadasList vendas={vm.vendasDistratadas} />
        </CardContent>
      </Card>
    </div>
  );
}
