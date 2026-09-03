export const runtime = "nodejs"; // better-sqlite3 usa binding nativo, não roda no Edge runtime.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/features/auth/schema";
import { findUsuarioByEmail } from "@/lib/features/auth/repository";
import { setSessionCookie, type Session } from "@/lib/features/auth/session";

const CREDENCIAIS_INVALIDAS = { error: "Credenciais inválidas." } as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(CREDENCIAIS_INVALIDAS, { status: 401 });
  }

  const usuario = findUsuarioByEmail(parsed.data.email);

  // Mesma resposta genérica para e-mail inexistente e senha errada — nunca
  // diferenciar as duas causas (evita enumeração de usuários).
  if (!usuario) {
    return NextResponse.json(CREDENCIAIS_INVALIDAS, { status: 401 });
  }

  const senhaConfere = await bcrypt.compare(
    parsed.data.senha,
    usuario.senha_hash,
  );
  if (!senhaConfere) {
    return NextResponse.json(CREDENCIAIS_INVALIDAS, { status: 401 });
  }

  const session: Session = {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel as Session["papel"],
  };
  await setSessionCookie(session);

  // senha_hash nunca sai no JSON de resposta.
  return NextResponse.json({ user: session });
}
