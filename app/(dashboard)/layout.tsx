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
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">{session.nome}</span>
        <LogoutButton />
      </header>
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  );
}
