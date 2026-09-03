import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/features/auth/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
