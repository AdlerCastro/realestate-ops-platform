// Recria as 3 views de normalização (v_unidades_norm, v_vendas_norm,
// v_financeiro_reconciliado) no arquivo apontado por DATABASE_PATH. Existe
// para permitir reset repetível a partir da cópia pristina
// (data/cambara_teste_tecnico.pristine.db, sem views) — sem isso, o SQL só
// existia dentro do binário .db commitado e como texto solto na
// documentação, sem forma versionada de reaplicar. SQL idêntico ao aplicado
// na sessão de normalização (conferido contra sqlite_master.sql do arquivo
// de trabalho atual — realestate-ops-platform-instrucoes.md seção 4 só tem a
// descrição em prosa, não o texto literal). Idempotente: pula views que já
// existem, não recria nem dá erro.
try {
  process.loadEnvFile();
} catch {
  // .env ausente (ex.: CI) — segue com variáveis já presentes no ambiente.
}

const VIEWS: Record<string, string> = {
  v_unidades_norm: `
CREATE VIEW v_unidades_norm AS
SELECT
  u.id,
  u.empreendimento_id,
  u.identificador,
  u.tipo,
  u.area_privativa_m2,
  u.valor_tabela,
  u.status AS status_bruto,
  CASE
    WHEN LOWER(TRIM(u.status)) IN ('vendida') THEN 'vendida'
    WHEN LOWER(TRIM(u.status)) IN ('disponivel','disponível') THEN 'disponivel'
    WHEN LOWER(TRIM(u.status)) IN ('reservada') THEN 'reservada'
    WHEN LOWER(TRIM(u.status)) IN ('distrato','cancelado') THEN 'distrato'
    ELSE 'nao_mapeado'
  END AS status_canonico
FROM unidades u`,

  v_vendas_norm: `
CREATE VIEW v_vendas_norm AS
SELECT
  v.id,
  v.unidade_id,
  v.cliente_id,
  v.data_venda,
  v.valor_venda,
  v.forma_pagamento,
  v.status_venda AS status_venda_bruto,
  v.data_distrato,
  CASE
    WHEN LOWER(TRIM(v.status_venda)) IN ('ativa') THEN 'ativa'
    WHEN LOWER(TRIM(v.status_venda)) IN ('distrato','distratada') THEN 'distrato'
    ELSE 'nao_mapeado'
  END AS status_canonico
FROM vendas v`,

  v_financeiro_reconciliado: `
CREATE VIEW v_financeiro_reconciliado AS
SELECT
  f.id,
  f.empreendimento_id,
  f.mes_referencia,
  f.receita_reconhecida,
  f.custo_incorrido,
  f.despesas_corporativas_rat,
  f.resultado_reportado,
  (f.receita_reconhecida - f.custo_incorrido - f.despesas_corporativas_rat) AS resultado_recalculado,
  ROUND(f.resultado_reportado - (f.receita_reconhecida - f.custo_incorrido - f.despesas_corporativas_rat), 2) AS diferenca,
  CASE WHEN ABS(f.resultado_reportado - (f.receita_reconhecida - f.custo_incorrido - f.despesas_corporativas_rat)) > 0.01
       THEN 1 ELSE 0 END AS divergente
FROM financeiro_mensal f`,
};

async function setupViews() {
  const { db } = await import("../lib/db/connection");

  try {
    const existeView = db.prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'view' AND name = ?",
    );

    for (const [nome, sql] of Object.entries(VIEWS)) {
      if (existeView.get(nome)) {
        console.log(`- ${nome}: já existe, pulei.`);
        continue;
      }

      db.exec(sql);
      console.log(`- ${nome}: criada.`);
    }
  } finally {
    db.close();
  }
}

setupViews().catch((error) => {
  console.error("Falha ao rodar setup-views:", error);
  process.exitCode = 1;
});
