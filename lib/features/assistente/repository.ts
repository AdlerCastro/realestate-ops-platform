// Assistente de linguagem natural (sessão 4) — somente leitura. Duas
// chamadas Groq (ver lib/features/assistente/groq.ts e prompts.ts):
// 1. Pergunta em português → SQL (JSON forçado).
// 2. Linhas retornadas + pergunta original → resposta em português.
//
// Guardrails (AGENTS.md / instruções da sessão, não opcionais):
// - Executa contra `dbReadonly` (lib/db/connection-readonly.ts), conexão
//   SEPARADA da escrita, aberta em modo readonly do SQLite.
// - Rejeita qualquer SQL que não seja um único SELECT antes de executar —
//   defesa em profundidade; a proteção real é a conexão readonly.
// - 1 retry apenas se a execução falhar (erro reenviado ao LLM). Se falhar
//   de novo, nunca força uma resposta incerta — devolve status "falha".
import { z } from "zod";
import { dbReadonly } from "@/lib/db/connection-readonly";
import {
  chamarGroq,
  GroqRateLimitError,
  MODELO_SQL,
  MODELO_RESPOSTA,
  type GroqMessage,
} from "./groq";
import {
  SYSTEM_PROMPT_SQL,
  FEW_SHOT_SQL,
  SYSTEM_PROMPT_RESPOSTA,
} from "./prompts";

export interface RespostaAssistente {
  status: "sucesso" | "falha";
  pergunta: string;
  /** SQL efetivamente executada (sucesso) ou a última tentativa que falhou. Vazia se o LLM nunca chegou a gerar uma consulta válida. */
  sql: string;
  linhas: Record<string, unknown>[];
  resposta: string;
}

const MAX_TENTATIVAS = 2; // tentativa inicial + 1 retry

const sqlOutputSchema = z.object({ sql: z.string().min(1) });

/** Defesa em profundidade: SELECT único, sem statement adicional após ";". */
function validarSelectUnico(sqlBruto: string): string {
  const sql = sqlBruto.trim().replace(/;\s*$/, "");

  if (!/^select\b/i.test(sql)) {
    throw new Error("A consulta gerada não começa com SELECT.");
  }
  if (sql.includes(";")) {
    throw new Error("A consulta gerada contém mais de um comando SQL.");
  }

  return sql;
}

async function gerarSql(
  pergunta: string,
  tentativaAnterior?: { sql: string; erro: string },
): Promise<string> {
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_SQL },
    ...FEW_SHOT_SQL,
    { role: "user", content: pergunta },
  ];

  if (tentativaAnterior) {
    messages.push(
      {
        role: "assistant",
        content: JSON.stringify({ sql: tentativaAnterior.sql }),
      },
      {
        role: "user",
        content: `Essa consulta falhou ao executar no SQLite com o erro: "${tentativaAnterior.erro}". Corrija o problema e responda de novo apenas com {"sql": "..."}.`,
      },
    );
  }

  const conteudo = await chamarGroq({
    model: MODELO_SQL,
    messages,
    jsonMode: true,
  });

  const { sql } = sqlOutputSchema.parse(JSON.parse(conteudo));
  return validarSelectUnico(sql);
}

function executarSql(sql: string): Record<string, unknown>[] {
  return dbReadonly.prepare(sql).all() as Record<string, unknown>[];
}

async function gerarRespostaFinal(
  pergunta: string,
  sql: string,
  linhas: Record<string, unknown>[],
): Promise<string> {
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_RESPOSTA },
    {
      role: "user",
      content: `Pergunta original: ${pergunta}\n\nSQL executada: ${sql}\n\nLinhas retornadas (JSON): ${JSON.stringify(linhas)}`,
    },
  ];

  const resposta = await chamarGroq({ model: MODELO_RESPOSTA, messages });
  return resposta.trim();
}

export async function responderPergunta(
  pergunta: string,
): Promise<RespostaAssistente> {
  let ultimaSqlTentada = "";
  let ultimoErro: string | undefined;
  let ultimoErroFoiRateLimit = false;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    try {
      const sql = await gerarSql(
        pergunta,
        tentativa === 0
          ? undefined
          : { sql: ultimaSqlTentada, erro: ultimoErro! },
      );
      ultimaSqlTentada = sql;

      const linhas = executarSql(sql);
      const resposta = await gerarRespostaFinal(pergunta, sql, linhas);

      return { status: "sucesso", pergunta, sql, linhas, resposta };
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : String(error);
      ultimoErroFoiRateLimit = error instanceof GroqRateLimitError;
    }
  }

  return {
    status: "falha",
    pergunta,
    sql: ultimaSqlTentada,
    linhas: [],
    resposta: ultimoErroFoiRateLimit
      ? "Muitas perguntas em sequência — aguarde alguns segundos e tente novamente."
      : "Não consegui responder com confiança nos dados disponíveis.",
  };
}
