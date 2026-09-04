import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listarVendasParaListagem } from "@/lib/features/vendas/repository";
import {
  contarUnidadesPorStatus,
  listarUnidadesParaListagem,
} from "@/lib/features/unidades/repository";
import { VendasDashboard } from "./vendas-dashboard";

export default async function VendasPage() {
  const vendas = listarVendasParaListagem();
  const unidadesPorStatus = contarUnidadesPorStatus();
  const unidades = listarUnidadesParaListagem();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vendas</h1>
        <Button size="sm" render={<Link href="/vendas/novo" />}>
          Nova venda
        </Button>
      </div>
      <VendasDashboard
        vendas={vendas}
        unidadesPorStatus={unidadesPorStatus}
        unidades={unidades}
      />
    </div>
  );
}
