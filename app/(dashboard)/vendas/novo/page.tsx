import { listarUnidadesDisponiveis } from "@/lib/features/unidades/repository";
import { listarClientes } from "@/lib/features/clientes/repository";
import { VendaForm } from "./venda-form";

// Leitura direta via Server Component (sem round-trip HTTP) — decisão de
// arquitetura do projeto para toda leitura, ver instruções seção 3.
export default async function NovaVendaPage() {
  const unidades = listarUnidadesDisponiveis();
  const clientes = listarClientes();

  return (
    <div className="flex flex-col items-center gap-4">
      <VendaForm unidades={unidades} clientes={clientes} />
    </div>
  );
}
