import { z } from "zod";

// Verificado manualmente contra o banco real (data/cambara_teste_tecnico.db):
// exatamente estes 3 valores distintos em vendas.forma_pagamento, sem variação
// de grafia (ao contrário de status/status_venda). Ver instruções do projeto,
// seção 4 — se uma 4ª variante aparecer, não ampliar o enum silenciosamente.
export const formaPagamentoEnum = z.enum([
  "Financiamento",
  "Parcelado Direto",
  "À vista",
]);

// Verificado manualmente contra o banco real (data/cambara_teste_tecnico.db):
// exatamente estes 3 valores distintos em clientes.perfil, sem variação de
// grafia (mesmo padrão de cautela de forma_pagamento, regra C4). 1 cliente
// pré-existente tem perfil NULL — não corrigido retroativamente (regra C7,
// docs/regras-de-negocio.md); a exigência vale só para cadastros novos.
export const perfilEnum = z.enum(
  ["Morador", "Investidor", "Institucional"],
  "Perfil é obrigatório.",
);

export const clienteNovoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  cidade: z.string().trim().min(1, "Cidade é obrigatória."),
  uf: z.string().trim().max(2).optional(),
  // Obrigatório mesmo clientes.perfil sendo nullable no schema do banco —
  // mesmo precedente já aplicado a cidade (regra C5/C7).
  perfil: perfilEnum,
  email: z.string().trim().email("E-mail inválido.").optional(),
});

export type ClienteNovoInput = z.infer<typeof clienteNovoSchema>;

// clienteId OU clienteNovo, nunca os dois nem nenhum — sem checagem de
// duplicidade no cadastro do cliente novo (dedup é responsabilidade
// exclusiva da camada de leitura, ver lib/features/clientes/dedup.ts).
export const registrarVendaSchema = z
  .object({
    unidadeId: z.number().int().positive(),
    valorVenda: z.number().positive("O valor da venda deve ser positivo."),
    formaPagamento: formaPagamentoEnum,
    clienteId: z.number().int().positive().optional(),
    clienteNovo: clienteNovoSchema.optional(),
  })
  .refine(
    (data) =>
      (data.clienteId !== undefined) !== (data.clienteNovo !== undefined),
    {
      message:
        "Informe clienteId (cliente existente) ou clienteNovo, nunca os dois nem nenhum.",
      path: ["clienteId"],
    },
  );

export type RegistrarVendaInput = z.infer<typeof registrarVendaSchema>;

export const registrarDistratoSchema = z.object({
  vendaId: z.number().int().positive(),
});

export type RegistrarDistratoInput = z.infer<typeof registrarDistratoSchema>;
