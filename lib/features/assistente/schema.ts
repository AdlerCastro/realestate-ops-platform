import { z } from "zod";

export const perguntaSchema = z.object({
  pergunta: z
    .string()
    .trim()
    .min(1, "Pergunta é obrigatória.")
    .max(500, "Pergunta muito longa (máximo 500 caracteres)."),
});

export type PerguntaInput = z.infer<typeof perguntaSchema>;
