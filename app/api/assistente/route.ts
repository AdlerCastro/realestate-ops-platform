export const runtime = "nodejs"; // dbReadonly usa better-sqlite3 (binding nativo), não roda no Edge runtime.

import { NextResponse } from "next/server";
import { perguntaSchema } from "@/lib/features/assistente/schema";
import { responderPergunta } from "@/lib/features/assistente/repository";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = perguntaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", detalhes: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const resultado = await responderPergunta(parsed.data.pergunta);
  return NextResponse.json(resultado);
}
