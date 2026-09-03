// Cliente mínimo da API da Groq via fetch direto (endpoint compatível com o
// formato OpenAI) — sem SDK extra, consistente com o restante do projeto,
// que evita dependência para algo que uma chamada HTTP simples resolve.
//
// Modelos escolhidos nesta sessão (2026-09-03): os nomes registrados
// originalmente nas instruções do projeto (`llama-3.3-70b-versatile` e
// `llama-3.1-8b-instant`) foram desativados pela Groq em 2026-08-16
// (confirmado em https://console.groq.com/docs/deprecations). Substitutos
// recomendados pela própria Groq, adotados aqui:
// - Call 1 (texto → SQL, tarefa mais exigente): `openai/gpt-oss-120b`.
// - Call 2 (parafrasear resultado em português): `openai/gpt-oss-20b`.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export const MODELO_SQL = "openai/gpt-oss-120b";
export const MODELO_RESPOSTA = "openai/gpt-oss-20b";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Erro 429 da Groq (rate limit) — distinto de falha de geração/execução de SQL, para a rota poder devolver uma mensagem específica ao usuário. */
export class GroqRateLimitError extends Error {}

interface ChamarGroqParams {
  model: string;
  messages: GroqMessage[];
  /** Ativa response_format: {type: "json_object"} — só a Call 1 usa. */
  jsonMode?: boolean;
}

export async function chamarGroq({
  model,
  messages,
  jsonMode,
}: ChamarGroqParams): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não definido. Configure a variável de ambiente (ver .env.example).",
    );
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new GroqRateLimitError(
        `Groq API respondeu 429 (rate limit): ${detalhe}`,
      );
    }
    throw new Error(`Groq API respondeu ${response.status}: ${detalhe}`);
  }

  const data = await response.json();
  const conteudo = data?.choices?.[0]?.message?.content;

  if (typeof conteudo !== "string" || conteudo.trim() === "") {
    throw new Error("Groq API retornou resposta sem conteúdo de texto.");
  }

  return conteudo;
}
