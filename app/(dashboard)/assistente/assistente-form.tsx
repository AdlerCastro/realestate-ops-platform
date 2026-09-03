"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAssistente } from "@/lib/features/assistente/hooks/use-assistente";

export function AssistenteForm() {
  const { pergunta, setPergunta, handleSubmit, isPending, resultado, erro } =
    useAssistente();

  const colunas =
    resultado?.status === "sucesso" && resultado.linhas.length > 0
      ? Object.keys(resultado.linhas[0])
      : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Pergunta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pergunta">Pergunta em português</Label>
              <Input
                id="pergunta"
                name="pergunta"
                value={pergunta}
                onChange={(event) => setPergunta(event.target.value)}
                placeholder="Ex.: Quais os 3 empreendimentos com pior velocidade de vendas?"
                disabled={isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={isPending || !pergunta.trim()}
              className="self-start"
            >
              {isPending ? "Consultando..." : "Perguntar"}
            </Button>
          </form>
          {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>
              {resultado.status === "sucesso"
                ? "Resposta"
                : "Não foi possível responder"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{resultado.resposta}</p>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                SQL{" "}
                {resultado.status === "sucesso" ? "executada" : "que falhou"}
              </span>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
                <code>
                  {resultado.sql || "(nenhuma consulta válida foi gerada)"}
                </code>
              </pre>
            </div>

            {resultado.status === "sucesso" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {resultado.linhas.length} linha(s) retornada(s)
                </span>

                {resultado.linhas.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {colunas.map((coluna) => (
                            <th
                              key={coluna}
                              scope="col"
                              className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                            >
                              {coluna}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.linhas.map((linha, indice) => (
                          <tr
                            key={indice}
                            className="border-b border-border last:border-0"
                          >
                            {colunas.map((coluna) => (
                              <td
                                key={coluna}
                                className="px-2 py-1.5 whitespace-nowrap"
                              >
                                {String(linha[coluna] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
