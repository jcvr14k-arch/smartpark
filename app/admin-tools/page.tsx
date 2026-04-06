'use client';

import { useEffect, useMemo, useState } from 'react';
import { deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import {
  PencilLine,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  Wallet,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { tenantCollection, tenantDoc } from '@/lib/tenant';
import { CashRegister, ParkingTicket } from '@/types';
import { money, shortDateTime } from '@/utils/format';

type TicketRow = ParkingTicket;
type CashRow = CashRegister;

function toIsoValue(value?: string) {
  return value || '';
}

function sortTickets(items: TicketRow[]) {
  return [...items].sort((a, b) =>
    toIsoValue(b.exitAt || b.entryAt).localeCompare(toIsoValue(a.exitAt || a.entryAt))
  );
}

function sortCash(items: CashRow[]) {
  return [...items].sort((a, b) => toIsoValue(b.openedAt).localeCompare(toIsoValue(a.openedAt)));
}

export default function AdminToolsPage() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCode, setSearchCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<TicketRow | null>(null);
  const [newValue, setNewValue] = useState('');
  const [manualCashValue, setManualCashValue] = useState('');

  async function loadData() {
    if (!profile?.tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [ticketSnap, cashSnap] = await Promise.all([
        getDocs(tenantCollection(db, profile.tenantId, 'parkingTickets')),
        getDocs(tenantCollection(db, profile.tenantId, 'cashRegisters')),
      ]);

      const loadedTickets = ticketSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<TicketRow, 'id'>),
      }));

      const loadedCash = cashSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CashRow, 'id'>),
      }));

      setTickets(sortTickets(loadedTickets));
      setCashRegisters(sortCash(loadedCash));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os dados administrativos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [profile?.tenantId]);

  const filteredTickets = useMemo(() => {
    const term = searchCode.trim().toUpperCase();
    if (!term) return tickets;

    return tickets.filter((ticket) => {
      const haystack = [ticket.shortTicket, ticket.plate, ticket.id, ticket.status]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
      return haystack.includes(term);
    });
  }, [searchCode, tickets]);

  const relatedCash = useMemo(() => {
    if (!editingTicket?.closedCashRegisterId) return null;
    return cashRegisters.find((cash) => cash.id === editingTicket.closedCashRegisterId) || null;
  }, [cashRegisters, editingTicket]);

  function openEditor(ticket: TicketRow) {
    setEditingTicket(ticket);
    setNewValue(String(ticket.amountCharged || 0));
    setManualCashValue('');
    setMessage('');
    setError('');
  }

  function closeEditor() {
    setEditingTicket(null);
    setNewValue('');
    setManualCashValue('');
  }

  async function handleDeleteTicket(ticket: TicketRow) {
    if (!profile?.tenantId) return;
    const confirmed = window.confirm(`Excluir o ticket ${ticket.shortTicket}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setSavingId(ticket.id);
    setError('');
    setMessage('');

    try {
      await deleteDoc(tenantDoc(db, profile.tenantId, 'parkingTickets', ticket.id));
      setMessage(`Ticket ${ticket.shortTicket} excluído com sucesso.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir o ticket.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteCash(cash: CashRow) {
    if (!profile?.tenantId) return;
    const confirmed = window.confirm(`Excluir o caixa ${cash.id}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setSavingId(cash.id);
    setError('');
    setMessage('');

    try {
      await deleteDoc(tenantDoc(db, profile.tenantId, 'cashRegisters', cash.id));
      setMessage(`Caixa ${cash.id} excluído com sucesso.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir o caixa.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveTicketValue() {
    if (!profile?.tenantId || !editingTicket) return;

    const parsedNewValue = Number(String(newValue).replace(',', '.'));
    if (!Number.isFinite(parsedNewValue) || parsedNewValue < 0) {
      setError('Informe um valor válido para o ticket.');
      return;
    }

    setSavingId(editingTicket.id);
    setError('');
    setMessage('');

    try {
      const oldValue = Number(editingTicket.amountCharged || 0);
      const delta = Number((parsedNewValue - oldValue).toFixed(2));

      await updateDoc(tenantDoc(db, profile.tenantId, 'parkingTickets', editingTicket.id), {
        amountCharged: parsedNewValue,
      });

      if (editingTicket.closedCashRegisterId) {
        const currentCash = cashRegisters.find((cash) => cash.id === editingTicket.closedCashRegisterId);
        if (currentCash) {
          await updateDoc(tenantDoc(db, profile.tenantId, 'cashRegisters', currentCash.id), {
            revenueByTickets: Number(((currentCash.revenueByTickets || 0) + delta).toFixed(2)),
          });
        }
      }

      setMessage(`Valor do ticket ${editingTicket.shortTicket} atualizado com sucesso.`);
      closeEditor();
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar o valor do ticket.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveCashOnly() {
    if (!profile?.tenantId || !relatedCash) return;

    const parsedValue = Number(String(manualCashValue).replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setError('Informe um valor válido para o caixa.');
      return;
    }

    setSavingId(relatedCash.id);
    setError('');
    setMessage('');

    try {
      await updateDoc(tenantDoc(db, profile.tenantId, 'cashRegisters', relatedCash.id), {
        revenueByTickets: parsedValue,
      });
      setMessage(`Caixa ${relatedCash.id} ajustado com sucesso.`);
      closeEditor();
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar o caixa.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <RoleGuard roles={['admin']}>
      <div className="min-w-0 overflow-x-hidden">
        <PageHeader
          title="Admin Tools"
          subtitle="Ferramentas avançadas para localizar, ajustar e remover tickets e caixas sem atalho no menu lateral."
          actions={
            <button className="secondary-button w-full sm:w-auto" onClick={loadData}>
              <RefreshCw size={16} />
              Atualizar
            </button>
          }
        />

        <div className="panel-card mb-6 p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="app-input pl-11"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Pesquisar ticket pelo código, placa, ID ou status"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {filteredTickets.length} ticket(s) encontrado(s)
            </div>
          </div>

          {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr),minmax(0,0.9fr)]">
          <section className="panel-card p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="icon-soft-blue"><Ticket size={18} /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tickets</h2>
                <p className="text-sm text-slate-500">Busca por código, ajuste de valor e exclusão.</p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state min-h-[260px]">
                <p className="text-sm text-slate-500">Carregando tickets...</p>
              </div>
            ) : filteredTickets.length ? (
              <div className="space-y-3">
                {filteredTickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{ticket.shortTicket}</span>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{ticket.plate || '-'}</span>
                          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{ticket.status}</span>
                        </div>

                        <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                          <p><span className="font-semibold text-slate-900">Valor:</span> {money(ticket.amountCharged || 0)}</p>
                          <p><span className="font-semibold text-slate-900">Tipo:</span> {ticket.vehicleType}</p>
                          <p><span className="font-semibold text-slate-900">Entrada:</span> {shortDateTime(ticket.entryAt)}</p>
                          <p><span className="font-semibold text-slate-900">Saída:</span> {ticket.exitAt ? shortDateTime(ticket.exitAt) : '-'}</p>
                          <p><span className="font-semibold text-slate-900">Pagamento:</span> {ticket.paymentMethod || '-'}</p>
                          <p className="break-all"><span className="font-semibold text-slate-900">Caixa:</span> {ticket.closedCashRegisterId || '-'}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                        <button className="secondary-button justify-center py-2" onClick={() => openEditor(ticket)}>
                          <PencilLine size={16} />
                          Alterar valor
                        </button>
                        <button
                          className="secondary-button justify-center py-2 text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
                          onClick={() => handleDeleteTicket(ticket)}
                          disabled={savingId === ticket.id}
                        >
                          <Trash2 size={16} />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state min-h-[220px]">
                <p className="text-sm text-slate-500">Nenhum ticket encontrado para a busca informada.</p>
              </div>
            )}
          </section>

          <section className="panel-card p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="icon-soft-green"><Wallet size={18} /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Caixas</h2>
                <p className="text-sm text-slate-500">Consulta rápida e exclusão manual de caixa.</p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state min-h-[260px]">
                <p className="text-sm text-slate-500">Carregando caixas...</p>
              </div>
            ) : cashRegisters.length ? (
              <div className="space-y-3">
                {cashRegisters.map((cash) => (
                  <div key={cash.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{cash.id}</span>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{cash.status}</span>
                      </div>
                      <div className="grid gap-2 text-sm text-slate-600">
                        <p><span className="font-semibold text-slate-900">Aberto por:</span> {cash.operatorName}</p>
                        <p><span className="font-semibold text-slate-900">Fechado por:</span> {cash.closedByName || '-'}</p>
                        <p><span className="font-semibold text-slate-900">Abertura:</span> {shortDateTime(cash.openedAt)}</p>
                        <p><span className="font-semibold text-slate-900">Receita de tickets:</span> {money(cash.revenueByTickets || 0)}</p>
                      </div>
                      <button
                        className="secondary-button justify-center py-2 text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
                        onClick={() => handleDeleteCash(cash)}
                        disabled={savingId === cash.id}
                      >
                        <Trash2 size={16} />
                        Excluir caixa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state min-h-[220px]">
                <p className="text-sm text-slate-500">Nenhum caixa encontrado.</p>
              </div>
            )}
          </section>
        </div>

        {editingTicket ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Ajustar ticket</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Cupom {editingTicket.shortTicket} • Placa {editingTicket.plate || '-'}
                  </p>
                </div>
                <button className="secondary-button py-2" onClick={closeEditor}>Fechar</button>
              </div>

              <div className="mt-5 rounded-[22px] bg-slate-50 p-4 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Valor atual:</span> {money(editingTicket.amountCharged || 0)}</p>
                <p className="mt-1 break-all"><span className="font-semibold text-slate-900">Caixa vinculado:</span> {editingTicket.closedCashRegisterId || '-'}</p>
                {relatedCash ? (
                  <p className="mt-1"><span className="font-semibold text-slate-900">Receita atual do caixa:</span> {money(relatedCash.revenueByTickets || 0)}</p>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Novo valor do ticket</label>
                  <input
                    className="app-input"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Ex.: 12.50"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Ajuste manual do caixa vinculado</label>
                  <input
                    className="app-input"
                    value={manualCashValue}
                    onChange={(e) => setManualCashValue(e.target.value)}
                    placeholder="Opcional. Ex.: 120.00"
                    inputMode="decimal"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Preencha apenas se quiser definir um valor exato para a receita de tickets do caixa.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button className="secondary-button py-2" onClick={closeEditor}>Cancelar</button>
                <button className="primary-button py-2" onClick={handleSaveTicketValue} disabled={savingId === editingTicket.id}>
                  <PencilLine size={16} />
                  Salvar ticket e refletir no caixa
                </button>
                <button
                  className="secondary-button py-2"
                  onClick={handleSaveCashOnly}
                  disabled={!manualCashValue || !relatedCash || savingId === relatedCash?.id}
                >
                  <Wallet size={16} />
                  Ajustar só o caixa
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  );
}
