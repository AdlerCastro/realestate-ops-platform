// Assistente de linguagem natural (sessão 4) — somente leitura. Duas
// chamadas Groq (ver lib/features/assistente/groq.ts e prompts.ts):
// 1. Pergunta em português → SQL (JSON forçado).
// 2. Linhas retornadas + pergunta original → resposta em português.
//
// Guardrails (AGENTS.md / instruções da sessão, não opcionais):
// - Executa contra `dbReadonly` (lib/db/connection-readonly.ts), conexão
//   SEPARADA da escrita, aberta em modo readonly do SQLite — esta é a
//   proteção REAL contra escrita.
// - Rejeita qualquer SQL que não seja um único comando somente-leitura
//   (SELECT ou WITH ... SELECT, para CTEs) antes de executar, e rejeita
//   qualquer palavra-chave de escrita como token isolado em toda a consulta
//   — defesa em profundidade, redundante por design com a conexão readonly,
//   não a única barreira.
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

/** Palavras-chave de escrita, bloqueadas como token isolado (word boundary) em
 * qualquer parte da consulta — inclusive dentro de CTEs. Word boundary evita
 * falso positivo em coluna como `updated_at` (o `\b` depois de "update" não
 * bate, pois "d" também é caractere de palavra). */
const PALAVRA_CHAVE_ESCRITA =
  /\b(insert|update|delete|drop|alter|attach|pragma|replace|create)\b/i;

/**
 * Defesa em profundidade (não é a proteção real — ver `dbReadonly` acima):
 * aceita um único comando somente-leitura, SELECT ou WITH (CTE), sem
 * statement adicional após ";" e sem nenhuma palavra-chave de escrita como
 * token isolado em qualquer parte da consulta.
 */
function validarSelectUnico(sqlBruto: string): string {
  const sql = sqlBruto.trim().replace(/;\s*$/, "");

  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error("A consulta gerada não começa com SELECT ou WITH.");
  }
  if (sql.includes(";")) {
    throw new Error("A consulta gerada contém mais de um comando SQL.");
  }
  const escrita = sql.match(PALAVRA_CHAVE_ESCRITA);
  if (escrita) {
    throw new Error(
      `A consulta gerada contém operação de escrita não permitida ("${escrita[0]}").`,
    );
  }

  return sql;
}

async function gerarSql(
  pergunta: string,
  numeroTentativa: number,
  tentativaAnterior?: { sql: string; erro: string },
): Promise<string> {
  console.log(
    `[assistente] tentativa ${numeroTentativa} — pergunta: ${JSON.stringify(pergunta)}`,
  );

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

  console.log(
    `[assistente] tentativa ${numeroTentativa} — resposta bruta da Call 1: ${conteudo}`,
  );

  let sqlBruto: string;
  try {
    const parsed = sqlOutputSchema.parse(JSON.parse(conteudo));
    sqlBruto = parsed.sql;
  } catch (erroParse) {
    console.error(
      `[assistente] tentativa ${numeroTentativa} — FALHA AO PARSEAR JSON da Call 1: ${erroParse instanceof Error ? erroParse.message : String(erroParse)}`,
    );
    throw erroParse;
  }

  try {
    const sqlValidada = validarSelectUnico(sqlBruto);
    console.log(
      `[assistente] tentativa ${numeroTentativa} — SQL passou no guardrail: ${sqlValidada}`,
    );
    return sqlValidada;
  } catch (erroGuardrail) {
    console.error(
      `[assistente] tentativa ${numeroTentativa} — SQL REJEITADA PELO GUARDRAIL (bruta: ${sqlBruto}): ${erroGuardrail instanceof Error ? erroGuardrail.message : String(erroGuardrail)}`,
    );
    throw erroGuardrail;
  }
}

function executarSql(
  sql: string,
  numeroTentativa: number,
): Record<string, unknown>[] {
  try {
    const linhas = dbReadonly.prepare(sql).all() as Record<string, unknown>[];
    console.log(
      `[assistente] tentativa ${numeroTentativa} — SQL executada com sucesso (${linhas.length} linha(s)).`,
    );
    return linhas;
  } catch (erroExecucao) {
    console.error(
      `[assistente] tentativa ${numeroTentativa} — ERRO DO SQLITE ao executar SQL "${sql}": ${erroExecucao instanceof Error ? erroExecucao.message : String(erroExecucao)}`,
    );
    throw erroExecucao;
  }
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
    const numeroTentativa = tentativa + 1;
    try {
      const sql = await gerarSql(
        pergunta,
        numeroTentativa,
        tentativa === 0
          ? undefined
          : { sql: ultimaSqlTentada, erro: ultimoErro! },
      );
      ultimaSqlTentada = sql;

      const linhas = executarSql(sql, numeroTentativa);
      const resposta = await gerarRespostaFinal(pergunta, sql, linhas);

      return { status: "sucesso", pergunta, sql, linhas, resposta };
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : String(error);
      ultimoErroFoiRateLimit = error instanceof GroqRateLimitError;
      console.error(
        `[assistente] tentativa ${numeroTentativa} — encerrada com erro: ${ultimoErro}`,
      );
    }
  }

  console.error(
    `[assistente] TODAS AS TENTATIVAS FALHARAM — pergunta: ${JSON.stringify(pergunta)}, última SQL tentada: ${ultimaSqlTentada || "(nenhuma — falhou antes de gerar SQL válida)"}, último erro: ${ultimoErro}`,
  );

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
