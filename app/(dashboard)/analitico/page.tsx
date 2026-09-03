import {
  listarVelocidadeVendas,
  listarRiscoEstouroCusto,
  obterDuplicidadeCliente,
  obterDivergenciaFinanceira,
} from "@/lib/features/analitico/repository";
import { VelocidadeVendasSection } from "./velocidade-vendas-section";
import { RiscoEstouroCustoSection } from "./risco-estouro-custo-section";
import { DuplicidadeClienteSection } from "./duplicidade-cliente-section";
import { DivergenciaFinanceiraSection } from "./divergencia-financeira-section";

// Camada analítica (sessão 3): Server Component puro, sem hook/TanStack
// Query — mesmo padrão de VendasPage (leitura direta do repository a cada
// render). As 4 perguntas de negócio já estão fechadas e implementadas em
// lib/features/analitico/repository.ts; esta página só apresenta.
export default async function AnaliticoPage() {
  const velocidadeVendas = listarVelocidadeVendas();
  const riscoEstouroCusto = listarRiscoEstouroCusto();
  const duplicidadeCliente = obterDuplicidadeCliente();
  const divergenciaFinanceira = obterDivergenciaFinanceira();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Analítico</h1>
        <p className="text-sm text-muted-foreground">
          Quatro indicadores de negócio calculados a partir dos dados
          normalizados do banco. Cada seção traz a premissa de tratamento de
          dado aplicada.
        </p>
      </div>

      <VelocidadeVendasSection itens={velocidadeVendas} />
      <RiscoEstouroCustoSection itens={riscoEstouroCusto} />
      <DuplicidadeClienteSection resumo={duplicidadeCliente} />
      <DivergenciaFinanceiraSection resumo={divergenciaFinanceira} />
    </div>
  );
}
