// Sobrescreve o placeholder 'trocar_no_setup' em usuarios.senha_hash por um
// hash bcrypt real. Isso é alteração de DADO (não de schema) e é a exceção
// documentada à regra geral de "não alterar dado existente" (ver README,
// seção Autenticação, e AGENTS.md seção 0). Idempotente: só atualiza linhas
// cujo senha_hash ainda seja exatamente o placeholder.
import bcrypt from "bcryptjs";

// API nativa do Node (>=20.6) — evita depender do pacote `dotenv`, que não
// está na lista de dependências desta sessão. O Next.js carrega .env
// sozinho em dev/build; scripts standalone (como este) precisam fazer isso
// manualmente.
try {
  process.loadEnvFile();
} catch {
  // .env ausente (ex.: CI) — segue com variáveis já presentes no ambiente.
}

const PLACEHOLDER = "trocar_no_setup";
const SENHA_PADRAO = process.env.SEED_SENHA_PADRAO ?? "cambara2026";

interface UsuarioBasico {
  id: number;
  nome: string;
  email: string;
}

async function seed() {
  const { db } = await import("../lib/db/connection");

  try {
    const hash = await bcrypt.hash(SENHA_PADRAO, 10);

    const selecionar = db.prepare<[string], UsuarioBasico>(
      "SELECT id, nome, email FROM usuarios WHERE senha_hash = ?",
    );
    const atualizar = db.prepare(
      "UPDATE usuarios SET senha_hash = ? WHERE senha_hash = ?",
    );

    const aplicarSeed = db.transaction((senhaHash: string) => {
      const candidatos = selecionar.all(PLACEHOLDER);
      const result = atualizar.run(senhaHash, PLACEHOLDER);
      return { candidatos, alterados: result.changes };
    });

    const { candidatos, alterados } = aplicarSeed(hash);

    if (candidatos.length === 0) {
      console.log(
        "Nenhum usuário com senha_hash = 'trocar_no_setup' encontrado — seed já foi aplicado anteriormente (idempotente, nada a fazer).",
      );
      return;
    }

    console.log(`Usuários atualizados (${alterados}):`);
    for (const usuario of candidatos) {
      console.log(`  - #${usuario.id} ${usuario.nome} <${usuario.email}>`);
    }
    console.log(
      `\nSenha padrão definida para os usuários acima: "${SENHA_PADRAO}"`,
    );
  } finally {
    db.close();
  }
}

seed().catch((error) => {
  console.error("Falha ao rodar o seed:", error);
  process.exitCode = 1;
});
