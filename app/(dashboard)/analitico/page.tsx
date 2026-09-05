import {
  listarVelocidadeVendas,
  listarEstouroCustoMensal,
  obterDuplicidadeCliente,
  obterDivergenciaFinanceira,
  listarDivergenciaMensal,
} from "@/lib/features/analitico/repository";
import { VelocidadeVendasSection } from "./velocidade-vendas-section";
import { RiscoEstouroCustoSection } from "./risco-estouro-custo-section";
import { DuplicidadeClienteSection } from "./duplicidade-cliente-section";
import { DivergenciaFinanceiraSection } from "./divergencia-financeira-section";

// Camada analítica: Server Component puro, sem hook/TanStack Query — lê o
// banco direto via repository (sem round-trip HTTP, arquitetura travada em
// docs/log-tecnico-decisoes.md seção 3). Os dados vêm SEM agregação prévia
// por filtro (granularidade completa) — filtro e agregação de apresentação
// (cidade/uf/tipo/período, recorte top-N) são feitos nos client components
// abaixo, com estado local, nunca reconsultando o banco. Nenhum filtro
// altera a fórmula das 4 métricas, todas fechadas em docs/regras-de-negocio.md.
export default async function AnaliticoPage() {
  const velocidadeVendas = listarVelocidadeVendas();
  const estouroCustoMensal = listarEstouroCustoMensal();
  const duplicidadeCliente = obterDuplicidadeCliente();
  const divergenciaFinanceira = obterDivergenciaFinanceira();
  const divergenciaMensal = listarDivergenciaMensal();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Analítico</h1>
        <p className="text-base text-muted-foreground">
          Quatro indicadores de negócio calculados a partir dos dados
          normalizados do banco. Cada seção traz a premissa de tratamento de
          dado aplicada.
        </p>
      </div>

      <VelocidadeVendasSection itens={velocidadeVendas} />
      <RiscoEstouroCustoSection itens={estouroCustoMensal} />
      <DuplicidadeClienteSection resumo={duplicidadeCliente} />
      <DivergenciaFinanceiraSection
        resumo={divergenciaFinanceira}
        mensal={divergenciaMensal}
      />
    </div>
  );
}
