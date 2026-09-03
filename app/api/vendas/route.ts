export const runtime = "nodejs"; // better-sqlite3 usa binding nativo, não roda no Edge runtime.

import { NextResponse } from "next/server";
import { registrarVendaSchema } from "@/lib/features/vendas/schema";
import {
  registrarVenda,
  listarVendasAtivas,
} from "@/lib/features/vendas/repository";
import { NegocioError } from "@/lib/features/vendas/errors";

export async function GET() {
  return NextResponse.json({ vendas: listarVendasAtivas() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registrarVendaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", detalhes: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const venda = registrarVenda(parsed.data);
    return NextResponse.json({ venda }, { status: 201 });
  } catch (error) {
    if (error instanceof NegocioError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
