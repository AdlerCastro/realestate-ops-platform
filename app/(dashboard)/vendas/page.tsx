import Link from "next/link";
import { listarVendasAtivas } from "@/lib/features/vendas/repository";
import { VendasAtivasList } from "./vendas-ativas-list";

// Listagem mínima para escolher qual venda distratar — não é o dashboard
// completo de vendas (sessão 3).
export default async function VendasPage() {
  const vendas = listarVendasAtivas();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vendas ativas</h1>
        <Link
          className="bg-primary text-primary-foreground hover:bg-primary/80 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5 content-center"
          href="/vendas/novo"
        >
          Nova venda
        </Link>
      </div>
      <VendasAtivasList vendas={vendas} />
    </div>
  );
}
