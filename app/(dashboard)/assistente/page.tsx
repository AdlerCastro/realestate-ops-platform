import { AssistenteForm } from "./assistente-form";

// Página estática (sem leitura de banco no Server Component) — o formulário
// client-side chama /api/assistente a cada pergunta, mesmo padrão de
// vendas/novo (mutação via hook + TanStack Query).
export default function AssistentePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte em português sobre vendas, unidades, financeiro e
          empreendimentos. Este assistente só lê o banco — nenhuma escrita é
          feita a partir daqui.
        </p>
      </div>
      <AssistenteForm />
    </div>
  );
}
