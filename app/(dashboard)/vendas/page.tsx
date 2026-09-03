import Link from "next/link";
import { Button } from "@/components/ui/button";
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
        <Button size="sm" render={<Link href="/vendas/novo" />}>
          Nova venda
        </Button>
      </div>
      <VendasAtivasList vendas={vendas} />
    </div>
  );
}
