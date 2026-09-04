import Link from "next/link";
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
        <h1 className="text-lg font-semibold">Vendas </h1>
        <Link
          className="bg-primary text-primary-foreground hover:bg-primary/80 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5 content-center"
          href="/vendas/novo"
        >
          Nova venda
        </Link>
      </div>
      <VendasDashboard
        vendas={vendas}
        unidadesPorStatus={unidadesPorStatus}
        unidades={unidades}
      />
    </div>
  );
}
