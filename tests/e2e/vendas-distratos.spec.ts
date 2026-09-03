// Teste E2E persistido e commitado (exceção documentada em AGENTS.md, seção
// 2) — o fluxo de venda/distrato é o componente mais observado da avaliação.
// Roda isolado via `npx playwright test tests/e2e/`, sem Playwright entrar
// como devDependency do projeto (ver README, seção "Camada de escrita").
//
// Pré-requisito: `pnpm dev` rodando em http://localhost:3000 (ou definir
// PLAYWRIGHT_BASE_URL) contra o banco seedado (`pnpm seed`). O teste usa a
// unidade 4 (disponível no banco de trabalho) e assume que ela está livre
// no início da execução — o próprio teste distrata a venda que cria no
// final, então é seguro rodar em sequência sem resetar o banco. Se o
// cenário (a) falhar por "unidade não disponível", é sinal de que uma
// execução anterior não chegou ao passo (c) (ex.: teste interrompido no
// meio) — resetar o banco de trabalho a partir da cópia pristina resolve.
//
// `identificador` de unidade só é único dentro de um empreendimento (ex.:
// "Torre A - 0104" se repete em prédios diferentes) — por isso a linha da
// venda na listagem é localizada por `data-testid="venda-<id>"`, com o id
// capturado da resposta real de POST /api/vendas, não por texto.

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const UNIDADE_ID = 4;
const UNIDADE_IDENTIFICADOR = "Torre A - 0104";
const CLIENTE_ID = 1;
const CLIENTE_NOME = "Ursula Ferreira Ferreira";

test.describe("Venda e distrato", () => {
  // Mobile first (AGENTS.md seção 3): valida primeiro no viewport mobile,
  // que também é o layout usado por padrão pela listagem de vendas (cards
  // empilhados abaixo de md:, ver vendas-ativas-list.tsx).
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("E-mail").fill("candidato@cambara-teste.com.br");
    await page.getByLabel("Senha").fill("cambara2026");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(`${BASE_URL}/`);
  });

  test("vende uma unidade disponível, bloqueia a revenda e permite distratar", async ({
    page,
  }) => {
    // (a) Vender uma unidade disponível com sucesso.
    await page.goto(`${BASE_URL}/vendas/novo`);

    await page.getByLabel("Unidade").selectOption(String(UNIDADE_ID));
    await page.getByLabel("Valor da venda (R$)").fill("450000");
    await page.getByLabel("Forma de pagamento").selectOption("À vista");
    await page.getByLabel("Buscar cliente por nome").fill(CLIENTE_NOME);
    await page
      .getByLabel("Cliente", { exact: true })
      .selectOption(String(CLIENTE_ID));

    const [respostaVenda] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/vendas") &&
          res.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Registrar venda" }).click(),
    ]);
    expect(respostaVenda.status()).toBe(201);
    const { venda } = await respostaVenda.json();
    expect(venda.unidade_id).toBe(UNIDADE_ID);

    await page.waitForURL(`${BASE_URL}/vendas`);
    const linhaVenda = page.getByTestId(`venda-${venda.id}`).first();
    await expect(linhaVenda).toContainText(UNIDADE_IDENTIFICADOR);

    // A unidade vendida não deve mais aparecer no formulário de nova venda.
    await page.goto(`${BASE_URL}/vendas/novo`);
    const opcoesUnidade = await page
      .getByLabel("Unidade")
      .locator(`option[value="${UNIDADE_ID}"]`)
      .count();
    expect(opcoesUnidade).toBe(0);

    // (b) Tentar vender a mesma unidade de novo deve retornar erro de
    // negócio (409), não sucesso — validado direto contra a API (o próprio
    // formulário já impede escolher a unidade, ver checagem acima).
    const respostaRevenda = await page.request.post(`${BASE_URL}/api/vendas`, {
      data: {
        unidadeId: UNIDADE_ID,
        valorVenda: 999999,
        formaPagamento: "À vista",
        clienteId: CLIENTE_ID,
      },
    });
    expect(respostaRevenda.status()).toBe(409);
    const corpoRevenda = await respostaRevenda.json();
    expect(corpoRevenda.error).toBe("Unidade não disponível para venda.");

    // (c) Distratar a venda criada em (a) e confirmar que a unidade volta a
    // aparecer como disponível.
    await page.goto(`${BASE_URL}/vendas`);
    const linhaParaDistratar = page.getByTestId(`venda-${venda.id}`).first();
    await linhaParaDistratar.getByRole("button", { name: "Distratar" }).click();
    await expect(page.getByTestId(`venda-${venda.id}`).first()).toHaveCount(0);

    await page.goto(`${BASE_URL}/vendas/novo`);
    const opcoesAposDistrato = await page
      .getByLabel("Unidade")
      .locator(`option[value="${UNIDADE_ID}"]`)
      .count();
    expect(opcoesAposDistrato).toBe(1);
  });
});
