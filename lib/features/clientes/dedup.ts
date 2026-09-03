// Dedup de cliente não é uma view SQL — descartado por estourar o parser do
// SQLite em CTE encadeada (ver AGENTS.md / documento de decisões). Cálculo em
// tempo de leitura, sem materialização em tabela ou cache.

export interface Cliente {
  id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  perfil: string | null;
  data_cadastro: string;
  email: string | null;
}

const EMAIL_ALTA_CONFIANCA = /^contato\d+@exemplo\.com$/;

/** Normalização de texto compartilhada (dedup e busca de cliente no formulário de venda). */
export function normalizarTexto(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function chaveDedup(nome: string, cidade: string): string {
  return `${normalizarTexto(nome)}|${normalizarTexto(cidade)}`;
}

export type ConfiancaDedup = "alta" | "baixa";

export interface GrupoDedup {
  chave: string;
  clientes: Cliente[];
  confianca: ConfiancaDedup;
}

export function classificarGruposDedup(clientes: Cliente[]): GrupoDedup[] {
  const grupos = new Map<string, Cliente[]>();

  for (const cliente of clientes) {
    const chave = chaveDedup(cliente.nome, cliente.cidade ?? "");
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.push(cliente);
    } else {
      grupos.set(chave, [cliente]);
    }
  }

  const resultado: GrupoDedup[] = [];

  for (const [chave, membros] of grupos) {
    if (membros.length <= 1) continue;

    const temEmailAltaConfianca = membros.some(
      (c) => c.email !== null && EMAIL_ALTA_CONFIANCA.test(c.email),
    );

    resultado.push({
      chave,
      clientes: membros,
      confianca: temEmailAltaConfianca ? "alta" : "baixa",
    });
  }

  return resultado;
}
