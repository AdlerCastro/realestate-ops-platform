"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formaPagamentoEnum } from "@/lib/features/vendas/schema";
import { useVendaForm } from "@/lib/features/vendas/hooks/use-venda-form";
import type { Cliente } from "@/lib/features/clientes/dedup";
import type { UnidadeDisponivel } from "@/lib/features/unidades/repository";

interface VendaFormProps {
  unidades: UnidadeDisponivel[];
  clientes: Cliente[];
}

export function VendaForm({ unidades, clientes }: VendaFormProps) {
  const unidadeId = useId();
  const valorId = useId();
  const formaPagamentoId = useId();
  const buscaClienteId = useId();
  const clienteExistenteId = useId();
  const clienteNovoNomeId = useId();
  const clienteNovoCidadeId = useId();
  const clienteNovoUfId = useId();
  const clienteNovoEmailId = useId();
  const erroId = useId();

  const vm = useVendaForm({ unidades, clientes });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Registrar venda</CardTitle>
        <CardDescription>
          Unidade disponível, valor negociado e forma de pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={vm.handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={unidadeId}>Unidade</Label>
            <Select
              id={unidadeId}
              required
              value={vm.unidadeId}
              onChange={(event) => vm.setUnidadeId(event.target.value)}
            >
              <option value="" disabled>
                Selecione uma unidade disponível
              </option>
              {vm.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.empreendimento_nome} — {u.identificador} ({u.tipo})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={valorId}>Valor da venda (R$)</Label>
            <Input
              id={valorId}
              name="valorVenda"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              value={vm.valorVenda}
              onChange={(event) => vm.setValorVenda(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={formaPagamentoId}>Forma de pagamento</Label>
            <Select
              id={formaPagamentoId}
              required
              value={vm.formaPagamento}
              onChange={(event) =>
                vm.setFormaPagamento(
                  event.target
                    .value as (typeof formaPagamentoEnum.options)[number],
                )
              }
            >
              <option value="" disabled>
                Selecione
              </option>
              {formaPagamentoEnum.options.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="Tipo de cliente"
            >
              <Button
                type="button"
                variant={vm.modoCliente === "existente" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                aria-pressed={vm.modoCliente === "existente"}
                onClick={() => vm.setModoCliente("existente")}
              >
                Cliente existente
              </Button>
              <Button
                type="button"
                variant={vm.modoCliente === "novo" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                aria-pressed={vm.modoCliente === "novo"}
                onClick={() => vm.setModoCliente("novo")}
              >
                Cliente novo
              </Button>
            </div>

            {vm.modoCliente === "existente" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={buscaClienteId}>Buscar cliente por nome</Label>
                <Input
                  id={buscaClienteId}
                  type="text"
                  placeholder="Digite o nome do cliente"
                  value={vm.buscaCliente}
                  onChange={(event) => vm.setBuscaCliente(event.target.value)}
                />
                <Label htmlFor={clienteExistenteId}>Cliente</Label>
                <Select
                  id={clienteExistenteId}
                  required
                  value={vm.clienteId}
                  onChange={(event) => vm.setClienteId(event.target.value)}
                >
                  <option value="" disabled>
                    Selecione um cliente
                  </option>
                  {vm.clientesFiltrados.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.cidade ? `— ${c.cidade}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={clienteNovoNomeId}>Nome</Label>
                  <Input
                    id={clienteNovoNomeId}
                    required
                    value={vm.clienteNovoNome}
                    onChange={(event) =>
                      vm.setClienteNovoNome(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={clienteNovoCidadeId}>Cidade</Label>
                  <Input
                    id={clienteNovoCidadeId}
                    required
                    value={vm.clienteNovoCidade}
                    onChange={(event) =>
                      vm.setClienteNovoCidade(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={clienteNovoUfId}>UF (opcional)</Label>
                  <Input
                    id={clienteNovoUfId}
                    maxLength={2}
                    value={vm.clienteNovoUf}
                    onChange={(event) =>
                      vm.setClienteNovoUf(event.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={clienteNovoEmailId}>E-mail (opcional)</Label>
                  <Input
                    id={clienteNovoEmailId}
                    type="email"
                    value={vm.clienteNovoEmail}
                    onChange={(event) =>
                      vm.setClienteNovoEmail(event.target.value)
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {vm.erro ? (
            <p id={erroId} role="alert" className="text-sm text-destructive">
              {vm.erro}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={vm.isPending}>
            {vm.isPending ? "Registrando..." : "Registrar venda"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
