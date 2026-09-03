import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Abordagem escolhida: cookie httpOnly com payload JSON + assinatura
// HMAC-SHA256 (Node `crypto`, sem dependência nova), em vez de sessão
// armazenada em tabela do banco. Justificativa:
//   1. `cambara_teste_tecnico.db` não pode ganhar schema novo (regra 0 do
//      AGENTS.md) — uma tabela de sessões está fora de cogitação sem
//      aprovação explícita.
//   2. O escopo desta sessão pede algo simples e local (sem Redis/serviço
//      externo); um cookie assinado e stateless resolve sem infra extra.
//   3. Evita adicionar uma lib de sessão (ex.: iron-session) que não estava
//      na lista de dependências a instalar — `node:crypto` já é nativo.
// Trade-off aceito: não há revogação server-side antes da expiração
// (logout apenas limpa o cookie do cliente). Aceitável neste escopo — sem
// RBAC, sem dados sensíveis além de id/nome/papel no payload.

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

const sessionSchema = z.object({
  id: z.number(),
  nome: z.string(),
  papel: z.enum(["diretoria", "comercial", "engenharia", "financeiro"]),
});

export type Session = z.infer<typeof sessionSchema>;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET não definido. Configure a variável de ambiente (ver .env.example).",
    );
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Serializa e assina uma sessão para armazenar no cookie. */
export function encodeSession(session: Session): string {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/** Verifica a assinatura e decodifica o valor do cookie. Retorna null se inválido/adulterado. */
function decodeSession(token: string): Session | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    return sessionSchema.parse(parsed);
  } catch {
    return null;
  }
}

/**
 * Lê a sessão atual em Server Components e Route Handlers. Papel do usuário
 * deve ser sempre lido daqui — nunca de payload enviado pelo cliente.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSession(token);
}

/** Só pode ser chamado em Route Handlers (resposta ainda não iniciou o streaming). */
export async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
