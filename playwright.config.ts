import { defineConfig } from "@playwright/test";

// Config mínima para o teste E2E persistido de venda/distrato (AGENTS.md,
// seção 2 — exceção documentada). Playwright continua sendo ferramenta de
// sessão via `npx`, não devDependency do projeto: este arquivo só existe
// para o comando `npx playwright test tests/e2e/` ter onde ler baseURL e
// diretório de teste.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
