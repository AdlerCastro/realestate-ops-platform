import type {
  DuplicidadeClienteResumo,
  GrupoClienteDedupResumo,
} from "@/lib/features/analitico/repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface DuplicidadeClienteSectionProps {
  resumo: DuplicidadeClienteResumo;
}

function tituloGrupo(grupo: GrupoClienteDedupResumo): string {
  const primeiro = grupo.clientes[0];
  return `${primeiro.nome} — ${primeiro.cidade ?? "cidade não informada"}`;
}

function ListaClientesGrupo({ grupo }: { grupo: GrupoClienteDedupResumo }) {
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="font-medium">{tituloGrupo(grupo)}</p>
      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
        {grupo.clientes.map((cliente) => (
          <li key={cliente.id}>
            #{cliente.id} {cliente.nome} — {cliente.email ?? "sem e-mail"}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sem filtro (regra desta sessão): retrato global da base inteira,
// independente dos filtros usados nas perguntas 1/2/4. Sem gráfico — só
// stat cards + explicação em prosa (regra B4). Só os números ATUAIS da
// política de alta/baixa confiança são exibidos; o número histórico
// (1.436 / R$ 3.176.094,10, mesclando alta+baixa) fica só como comparação
// interna do repository, nunca renderizado aqui.
export function DuplicidadeClienteSection({
  resumo,
}: DuplicidadeClienteSectionProps) {
  const {
    totalGrupos,
    gruposAltaConfianca,
    gruposBaixaConfianca,
    clientesCompradoresBruto,
    ticketMedioBruto,
    clientesCompradoresCorrigido,
    ticketMedioCorrigido,
  } = resumo;

  const exemploAltaConfianca = gruposAltaConfianca[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Duplicidade de cliente</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Grupos duplicados
            </p>
            <p className="text-lg font-semibold">{totalGrupos}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Alta / baixa confiança
            </p>
            <p className="text-lg font-semibold">
              {gruposAltaConfianca.length} / {gruposBaixaConfianca.length}
            </p>
          </div>
          <div className="rounded-lg border border-accent bg-accent/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Clientes compradores únicos
            </p>
            <p className="text-lg font-semibold">
              {clientesCompradoresCorrigido.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="rounded-lg border border-accent bg-accent/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Ticket médio
            </p>
            <p className="text-lg font-semibold">
              {formatarValor(ticketMedioCorrigido)}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Sem nenhum tratamento de duplicidade, a mesma base contaria{" "}
          {clientesCompradoresBruto.toLocaleString("pt-BR")} clientes
          compradores (ticket médio {formatarValor(ticketMedioBruto)}) — a
          diferença mostra o efeito de contar o mesmo cliente mais de uma vez.
        </p>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Como foi verificado:</strong>{" "}
            cada cliente recebe uma chave a partir de nome + cidade normalizados
            (minúsculo, acentos removidos, espaços colapsados) — registros com a
            mesma chave formam um grupo candidato a duplicidade.
          </p>
          <p>
            <strong className="text-foreground">
              O que separa alta de baixa confiança:
            </strong>{" "}
            um grupo só é fundido automaticamente (alta confiança) quando ao
            menos um dos seus membros tem e-mail no padrão
            &quot;contatoN@exemplo.com&quot; — sinal de dado sintético/gerado em
            massa, não de cliente real. Grupos sem esse sinal (baixa confiança)
            nunca são fundidos automaticamente; ficam sinalizados para revisão
            manual.
          </p>
          <p>
            <strong className="text-foreground">
              Por que e-mail sozinho não serve como sinal geral de duplicidade
              nesta base:
            </strong>{" "}
            o e-mail de cada cliente é gerado a partir do próprio ID do
            registro, o que garante um e-mail único por cadastro mesmo entre
            prováveis duplicatas reais — duas entradas do mesmo cliente real
            sempre têm e-mails diferentes. Por isso e-mail só entra como sinal
            no caso específico e detectável do padrão sintético
            &quot;contatoN@exemplo.com&quot;, nunca como comparação geral de
            e-mail entre registros.
          </p>
        </div>

        {exemploAltaConfianca && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Ver exemplo de grupo de alta confiança (
              {gruposAltaConfianca.length} no total — não listados
              individualmente)
            </summary>
            <div className="mt-2">
              <ListaClientesGrupo grupo={exemploAltaConfianca} />
            </div>
          </details>
        )}

        <details open={gruposBaixaConfianca.length > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            Requer verificação manual — {gruposBaixaConfianca.length} pares
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {gruposBaixaConfianca.map((grupo) => (
              <ListaClientesGrupo key={grupo.chave} grupo={grupo} />
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
