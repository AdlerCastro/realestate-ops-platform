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

export function DuplicidadeClienteSection({
  resumo,
}: DuplicidadeClienteSectionProps) {
  const {
    totalGrupos,
    totalRegistrosEnvolvidos,
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
        <p className="text-xs text-muted-foreground">
          Clientes agrupados por nome+cidade normalizados (acentos, espaços e
          caixa ignorados). Grupos com e-mail sintético no padrão
          &quot;contatoN@exemplo.com&quot; são de alta confiança e foram
          mesclados automaticamente no cálculo corrigido. Os demais grupos com
          nome+cidade coincidentes (8 pares) não têm nenhum outro sinal
          confiável de duplicidade na base e ficam sinalizados para revisão
          manual — não são mesclados em nenhum número.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Bruto (sem tratamento)
            </p>
            <p className="text-lg font-semibold">
              {clientesCompradoresBruto} clientes
            </p>
            <p className="text-sm text-muted-foreground">
              Ticket médio: {formatarValor(ticketMedioBruto)}
            </p>
          </div>
          <div className="rounded-lg border border-accent bg-accent/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Corrigido (alta confiança mesclada)
            </p>
            <p className="text-lg font-semibold">
              {clientesCompradoresCorrigido} clientes
            </p>
            <p className="text-sm text-muted-foreground">
              Ticket médio: {formatarValor(ticketMedioCorrigido)}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {totalGrupos} grupos de nome+cidade coincidentes (
          {totalRegistrosEnvolvidos} clientes envolvidos):{" "}
          {gruposAltaConfianca.length} de alta confiança (mesclados acima) e{" "}
          {gruposBaixaConfianca.length} de baixa confiança (não mesclados).
        </p>

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
