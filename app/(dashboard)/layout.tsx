import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/features/auth/session";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="font-medium">
            Cambará
          </Link>
          <Link
            href="/vendas"
            className="text-muted-foreground hover:text-foreground"
          >
            Vendas
          </Link>
        </nav>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm font-medium">{session.nome}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  );
}
