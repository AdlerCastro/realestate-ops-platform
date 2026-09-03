/** Erro de regra de negócio (ex.: unidade indisponível) — mapeado para 409, nunca para 500 genérico. */
export class NegocioError extends Error {}
