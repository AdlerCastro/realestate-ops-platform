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

export const clienteNovoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  cidade: z.string().trim().min(1, "Cidade é obrigatória."),
  uf: z.string().trim().max(2).optional(),
  perfil: z.string().trim().optional(),
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
