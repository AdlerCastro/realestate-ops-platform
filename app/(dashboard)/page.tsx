import { getSession } from "@/lib/features/auth/session";

export default async function DashboardHomePage() {
  const session = await getSession();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">Bem-vindo(a), {session?.nome}</h1>
      <p className="text-sm text-muted-foreground">
        Papel: {session?.papel}. Nenhum módulo foi implementado ainda nesta
        sessão.
      </p>
    </div>
  );
}
