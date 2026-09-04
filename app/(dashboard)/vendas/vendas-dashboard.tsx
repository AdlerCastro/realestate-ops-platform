"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVendasListagem } from "@/lib/features/vendas/hooks/use-vendas-listagem";
import type { VendaListagemItem } from "@/lib/features/vendas/repository";
import type {
  UnidadeListagemItem,
  UnidadesPorStatus,
} from "@/lib/features/unidades/repository";
import { VendasCharts } from "./vendas-charts";
import { VendasFiltros } from "./vendas-filtros";
import { VendasAtivasList } from "./vendas-ativas-list";
import { VendasDistratadasList } from "./vendas-distratadas-list";
import { UnidadesList } from "./unidades-list";

interface VendasDashboardProps {
  vendas: VendaListagemItem[];
  unidadesPorStatus: UnidadesPorStatus[];
  unidades: UnidadeListagemItem[];
}

export function VendasDashboard({
  vendas,
  unidadesPorStatus,
  unidades,
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
        <CardContent>
          <Tabs defaultValue="ativas">
            <TabsList className="w-full">
              <TabsTrigger value="ativas" className="flex-1">
                Vendas ativas ({vm.vendasAtivas.length})
              </TabsTrigger>
              <TabsTrigger value="distratadas" className="flex-1">
                Vendas distratadas ({vm.vendasDistratadas.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ativas" className="mt-3">
              <VendasAtivasList vendas={vm.vendasAtivas} />
            </TabsContent>
            <TabsContent value="distratadas" className="mt-3">
              <VendasDistratadasList vendas={vm.vendasDistratadas} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <UnidadesList unidades={unidades} />
    </div>
  );
}
