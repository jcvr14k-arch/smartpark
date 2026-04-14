"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BanknoteArrowUp, Eye, Plus, Wallet, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { tenantCollection, tenantDoc } from '@/lib/tenant';
import { openPrintPage } from '@/lib/print';
import { CashRegister, ParkingTicket } from '@/types';
import { money, shortDateTime, toInputNumber } from '@/utils/format';
import {
  buildCashTicketRevenueMap,
  getCashDisplayedBalance,
  getCashDisplayedTotalRevenue,
  getTicketOfficialAmount,
} from '@/utils/financial';

export default function CaixaPage() {
  const { profile } = useAuth();
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [openCash, setOpenCash] = useState<CashRegister | null>(null);
  const [cashRows, setCashRows] = useState<CashRegister[]>([]);
  const [closedTickets, setClosedTickets] = useState<ParkingTicket[]>([]);
  const [message, setMessage] = useState('');
  const [selectedCash, setSelectedCash] = useState<CashRegister | null>(null);

  const canViewCashHistory = profile?.role === 'admin';

  useEffect(() => {
    let unsubRows: (() => void) | null = null;

    if (profile?.role === 'admin') {
      unsubRows = onSnapshot(tenantCollection(db, profile?.tenantId, 'cashRegisters'), (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CashRegister, 'id'>),
        }));
        items.sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
        setCashRows(items);
      });
    } else {
      setCashRows([]);
    }

    if (!profile) {
      return () => {
        if (unsubRows) unsubRows();
      };
    }

    const unsubTickets = onSnapshot(
      query(tenantCollection(db, profile?.tenantId, 'parkingTickets'), where('status', '==', 'finalizado')),
      (snap) => {
        setClosedTickets(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ParkingTicket, 'id'>) }))
        );
      }
    );

    const unsubOpen = onSnapshot(
      query(tenantCollection(db, profile?.tenantId, 'cashRegisters'), where('status', '==', 'aberto')),
      (snap) => {
        const row = snap.docs[0];
        setOpenCash(row ? { id: row.id, ...(row.data() as Omit<CashRegister, 'id'>) } : null);
      }
    );

    return () => {
      if (unsubRows) unsubRows();
      unsubTickets();
      unsubOpen();
    };
  }, [profile]);

  const ticketRevenueMap = useMemo(() => buildCashTicketRevenueMap(closedTickets), [closedTickets]);

  const withdrawalTotal = useMemo(
    () => openCash?.withdrawals?.reduce((sum, item) => sum + item.amount, 0) || 0,
    [openCash]
  );

  const openCashTotalRevenue = useMemo(
    () => getCashDisplayedTotalRevenue(openCash, ticketRevenueMap),
    [openCash, ticketRevenueMap]
  );

  const partialBalance = useMemo(
    () => getCashDisplayedBalance(openCash, ticketRevenueMap),
    [openCash, ticketRevenueMap]
  );

  const selectedCashTickets = useMemo(() => {
    if (!selectedCash?.id) return [] as ParkingTicket[];
    return closedTickets
      .filter((ticket) => ticket.closedCashRegisterId === selectedCash.id)
      .sort((a, b) => (a.exitAt || a.entryAt || '').localeCompare(b.exitAt || b.entryAt || ''));
  }, [closedTickets, selectedCash]);

  const selectedCashClassSummary = useMemo(() => {
    return selectedCashTickets.reduce<Record<string, { count: number; amount: number }>>((acc, ticket) => {
      const key = ticket.vehicleType || 'OUTROS';
      if (!acc[key]) acc[key] = { count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount = Number((acc[key].amount + getTicketOfficialAmount(ticket)).toFixed(2));
      return acc;
    }, {});
  }, [selectedCashTickets]);

  const selectedCashWithdrawalsTotal = useMemo(
    () => selectedCash?.withdrawals?.reduce((sum, item) => sum + item.amount, 0) || 0,
    [selectedCash]
  );

  const selectedCashTicketRevenue = useMemo(
    () => selectedCashTickets.reduce((sum, ticket) => sum + getTicketOfficialAmount(ticket), 0),
    [selectedCashTickets]
  );

  const selectedCashTotalRevenue = useMemo(
    () => Number((selectedCashTicketRevenue + (selectedCash?.revenueByMonthly || 0)).toFixed(2)),
    [selectedCash, selectedCashTicketRevenue]
  );

  const selectedCashFinalBalance = useMemo(
    () => Number((((selectedCash?.openingAmount || 0) + selectedCashTotalRevenue - selectedCashWithdrawalsTotal)).toFixed(2)),
    [selectedCash, selectedCashTotalRevenue, selectedCashWithdrawalsTotal]
  );

  async function handleOpen(event: FormEvent) {
    event.preventDefault();
    if (!profile || openCash) return;

    const existingOpenCash = await getDocs(
      query(tenantCollection(db, profile?.tenantId, 'cashRegisters'), where('status', '==', 'aberto'))
    );

    if (!existingOpenCash.empty) {
      setMessage('Já existe um caixa global aberto para o estacionamento.');
      setShowOpenForm(false);
      return;
    }

    await addDoc(tenantCollection(db, profile?.tenantId, 'cashRegisters'), {
      operatorId: profile.id,
      operatorName: profile.name,
      openedAt: new Date().toISOString(),
      openingAmount: toInputNumber(openingAmount),
      withdrawals: [],
      revenueByTickets: 0,
      revenueByMonthly: 0,
      status: 'aberto',
    });

    setShowOpenForm(false);
    setOpeningAmount('0');
    setMessage('');
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    if (!openCash) return;

    await updateDoc(tenantDoc(db, profile?.tenantId, 'cashRegisters', openCash.id), {
      withdrawals: [
        ...(openCash.withdrawals || []),
        {
          amount: toInputNumber(withdrawAmount),
          reason: withdrawReason,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    setWithdrawAmount('');
    setWithdrawReason('');
    setShowWithdrawForm(false);
  }

  async function handleCloseCash() {
    if (!openCash) return;

    const closedAt = new Date().toISOString();
    await updateDoc(tenantDoc(db, profile?.tenantId, 'cashRegisters', openCash.id), {
      status: 'fechado',
      closedAt,
      closedById: profile?.id || '',
      closedByName: profile?.name || '',
    });

    openPrintPage(`/print/caixa/${openCash.id}`);
  }

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Controle de abertura e fechamento de caixa"
        actions={
          !openCash ? (
            <button className="primary-button" onClick={() => setShowOpenForm((v) => !v)}>
              <Plus size={16} />
              Abrir Caixa
            </button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button className="secondary-button" onClick={() => setShowWithdrawForm((v) => !v)}>
                <BanknoteArrowUp size={16} />
                Sangria
              </button>
              <button className="primary-button" onClick={handleCloseCash}>
                <Wallet size={16} />
                Fechar Caixa
              </button>
            </div>
          )
        }
      />

      {showOpenForm && !openCash ? (
        <div className="panel-card mb-6 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Abrir Caixa</h2>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={handleOpen}>
            <input
              className="app-input max-w-sm"
              placeholder="Valor Inicial (R$)"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
            />
            <button className="primary-button">Abrir Caixa</button>
            <button className="secondary-button" type="button" onClick={() => setShowOpenForm(false)}>
              Cancelar
            </button>
          </form>
        </div>
      ) : null}

      {openCash ? (
        <div className="mb-6 panel-card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Caixa Atual</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Aberto por</p>
              <p className="mt-2 font-semibold text-slate-900">{openCash.operatorName}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Abertura</p>
              <p className="mt-2 font-semibold text-slate-900">{shortDateTime(openCash.openedAt)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Valor Inicial</p>
              <p className="mt-2 font-semibold text-slate-900">{money(openCash.openingAmount)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Faturamento</p>
              <p className="mt-2 font-semibold text-slate-900">{money(openCashTotalRevenue)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Saldo Parcial</p>
              <p className="mt-2 font-semibold text-slate-900">{money(partialBalance)}</p>
            </div>
          </div>

          {showWithdrawForm ? (
            <form className="mt-5 grid gap-3 md:grid-cols-[1fr,1fr,auto,auto]" onSubmit={handleWithdraw}>
              <input className="app-input" placeholder="Valor da Sangria (R$)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} required />
              <input className="app-input" placeholder="Motivo" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} required />
              <button className="primary-button" type="submit">Confirmar Sangria</button>
              <button className="secondary-button" type="button" onClick={() => setShowWithdrawForm(false)}>Cancelar</button>
            </form>
          ) : null}

          {!!openCash.withdrawals?.length && (
            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Histórico de sangrias do caixa atual</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {openCash.withdrawals.map((item, index) => (
                  <div key={`${item.createdAt}-${index}`} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-900">{item.reason}</p>
                      <p className="text-xs text-slate-500">{shortDateTime(item.createdAt)}</p>
                    </div>
                    <strong className="text-rose-700">{money(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {message ? <p className="mb-4 text-sm text-blue-700">{message}</p> : null}

      {canViewCashHistory ? (
        <div className="panel-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Histórico de caixas</h2>

          <div className="mt-4 space-y-3 md:hidden">
            {cashRows.length ? (
              cashRows.map((row) => {
                const sangrias = row.withdrawals?.reduce((sum, item) => sum + item.amount, 0) || 0;
                const finalValue = getCashDisplayedBalance(row, ticketRevenueMap);
                return (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.operatorName}</p>
                        <p className="mt-1 text-xs text-slate-500">Aberto em {shortDateTime(row.openedAt)}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.status === 'aberto' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {row.status === 'aberto' ? 'Aberto' : 'Fechado'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fechamento</p><p className="mt-1 font-semibold text-slate-800">{shortDateTime(row.closedAt)}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fechado por</p><p className="mt-1 font-semibold text-slate-800 break-words">{row.closedByName || '-'}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Valor inicial</p><p className="mt-1 font-semibold text-slate-800">{money(row.openingAmount)}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Faturamento</p><p className="mt-1 font-semibold text-slate-800">{money(getCashDisplayedTotalRevenue(row, ticketRevenueMap))}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sangrias</p><p className="mt-1 font-semibold text-slate-800">{money(sangrias)}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Valor final</p><p className="mt-1 font-semibold text-slate-800">{money(finalValue)}</p></div>
                    </div>
                    {row.status === 'fechado' ? (
                      <div className="mt-4">
                        <button className="secondary-button w-full" type="button" onClick={() => setSelectedCash(row)}>
                          <Eye size={16} />
                          Detalhar caixa
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhum registro</div>
            )}
          </div>

          <div className="table-shell mt-4 hidden md:block">
            <table>
              <thead>
                <tr>
                  <th>Aberto por</th>
                  <th>Abertura</th>
                  <th>Fechamento</th>
                  <th>Fechado por</th>
                  <th>V. Inicial</th>
                  <th>Faturamento</th>
                  <th>Sangrias</th>
                  <th>V. Final</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {cashRows.length ? (
                  cashRows.map((row) => {
                    const sangrias = row.withdrawals?.reduce((sum, item) => sum + item.amount, 0) || 0;
                    const finalValue = getCashDisplayedBalance(row, ticketRevenueMap);
                    return (
                      <tr key={row.id}>
                        <td>{row.operatorName}</td>
                        <td>{shortDateTime(row.openedAt)}</td>
                        <td>{shortDateTime(row.closedAt)}</td>
                        <td>{row.closedByName || '-'}</td>
                        <td>{money(row.openingAmount)}</td>
                        <td>{money(getCashDisplayedTotalRevenue(row, ticketRevenueMap))}</td>
                        <td>{money(sangrias)}</td>
                        <td>{money(finalValue)}</td>
                        <td><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.status === 'aberto' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{row.status === 'aberto' ? 'Aberto' : 'Fechado'}</span></td>
                        <td>
                          {row.status === 'fechado' ? (
                            <button className="secondary-button" type="button" onClick={() => setSelectedCash(row)}>
                              <Eye size={16} />
                              Detalhar
                            </button>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={10}>Nenhum registro</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}


      {selectedCash ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Auditoria do caixa fechado</h2>
                <p className="mt-1 text-sm text-slate-500">Caixa aberto por {selectedCash.operatorName} em {shortDateTime(selectedCash.openedAt)}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setSelectedCash(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-74px)] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Abertura</p><p className="mt-2 font-semibold text-slate-900">{shortDateTime(selectedCash.openedAt)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fechamento</p><p className="mt-2 font-semibold text-slate-900">{shortDateTime(selectedCash.closedAt)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor inicial</p><p className="mt-2 font-semibold text-slate-900">{money(selectedCash.openingAmount)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Faturamento auditado</p><p className="mt-2 font-semibold text-slate-900">{money(selectedCashTotalRevenue)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo final</p><p className="mt-2 font-semibold text-slate-900">{money(selectedCashFinalBalance)}</p></div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fechado por</p><p className="mt-2 font-semibold text-slate-900">{selectedCash.closedByName || '-'}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tickets vinculados</p><p className="mt-2 font-semibold text-slate-900">{selectedCashTickets.length}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sangrias</p><p className="mt-2 font-semibold text-slate-900">{money(selectedCashWithdrawalsTotal)}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mensalistas no caixa</p><p className="mt-2 font-semibold text-slate-900">{money(selectedCash.revenueByMonthly || 0)}</p></div>
              </div>

              <div className="mt-6 rounded-[24px] border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                  <h3 className="text-sm font-semibold text-slate-900">Resumo por classe</h3>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:px-5">
                  {(['CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO'] as const).map((vehicleType) => {
                    const summary = selectedCashClassSummary[vehicleType] || { count: 0, amount: 0 };
                    return (
                      <div key={vehicleType} className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{vehicleType}</p>
                        <p className="mt-2 text-sm text-slate-600">{summary.count} ticket(s)</p>
                        <p className="mt-1 font-semibold text-slate-900">{money(summary.amount)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                  <h3 className="text-sm font-semibold text-slate-900">Tickets do caixa</h3>
                </div>
                <div className="space-y-3 p-4 sm:hidden">
                  {selectedCashTickets.length ? selectedCashTickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Cupom #{ticket.shortTicket}</p>
                          <p className="mt-1 text-xs text-slate-500">{ticket.plate || '-'} • {ticket.vehicleType}</p>
                        </div>
                        <strong className="text-slate-900">{money(getTicketOfficialAmount(ticket))}</strong>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Saída</p><p className="mt-1 font-semibold text-slate-800">{shortDateTime(ticket.exitAt)}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pagamento</p><p className="mt-1 font-semibold text-slate-800">{ticket.paymentMethod || '-'}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Operador saída</p><p className="mt-1 font-semibold text-slate-800 break-words">{ticket.exitOperatorName || ticket.cashierName || '-'}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Permanência</p><p className="mt-1 font-semibold text-slate-800">{ticket.durationMinutes ? `${ticket.durationMinutes} min` : '-'}</p></div>
                      </div>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhum ticket vinculado a este caixa.</div>}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Cupom</th>
                        <th className="px-4 py-3 font-semibold">Placa</th>
                        <th className="px-4 py-3 font-semibold">Tipo</th>
                        <th className="px-4 py-3 font-semibold">Saída</th>
                        <th className="px-4 py-3 font-semibold">Operador</th>
                        <th className="px-4 py-3 font-semibold">Pagamento</th>
                        <th className="px-4 py-3 font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCashTickets.length ? selectedCashTickets.map((ticket) => (
                        <tr key={ticket.id} className="border-t border-slate-100 text-slate-700">
                          <td className="px-4 py-3 font-medium text-slate-900">#{ticket.shortTicket}</td>
                          <td className="px-4 py-3">{ticket.plate || '-'}</td>
                          <td className="px-4 py-3">{ticket.vehicleType}</td>
                          <td className="px-4 py-3">{shortDateTime(ticket.exitAt)}</td>
                          <td className="px-4 py-3">{ticket.exitOperatorName || ticket.cashierName || '-'}</td>
                          <td className="px-4 py-3">{ticket.paymentMethod || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{money(getTicketOfficialAmount(ticket))}</td>
                        </tr>
                      )) : <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Nenhum ticket vinculado a este caixa.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {!!selectedCash.withdrawals?.length ? (
                <div className="mt-6 rounded-[24px] border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                    <h3 className="text-sm font-semibold text-slate-900">Sangrias registradas</h3>
                  </div>
                  <div className="space-y-3 p-4 sm:px-5">
                    {selectedCash.withdrawals.map((item, index) => (
                      <div key={`${item.createdAt}-${index}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{item.reason}</p>
                          <p className="mt-1 text-xs text-slate-500">{shortDateTime(item.createdAt)}</p>
                        </div>
                        <strong className="text-rose-700">{money(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
