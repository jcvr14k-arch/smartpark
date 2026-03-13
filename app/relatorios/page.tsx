'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Download, FileText, MessageCircleMore, Printer, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import PageHeader from '@/components/PageHeader';
import RoleGuard from '@/components/RoleGuard';
import StatCard from '@/components/StatCard';
import { db } from '@/lib/firebase';
import { openPrintPage } from '@/lib/print';
import { EstablishmentSettings, ParkingTicket, PaymentMethod } from '@/types';
import { money, shortDateTime } from '@/utils/format';
import { buildReceiptWhatsappUrl } from '@/utils/whatsapp';

const PAGE_SIZE = 10;

export default function RelatoriosPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | PaymentMethod>('todos');
  const [tickets, setTickets] = useState<ParkingTicket[]>([]);
  const [settings, setSettings] = useState<EstablishmentSettings | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'parkingTickets'), (snap) => {
      setTickets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ParkingTicket, 'id'>) })));
    });
    getDoc(doc(db, 'settings', 'establishment')).then((snap) => {
      if (snap.exists()) setSettings(snap.data() as EstablishmentSettings);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return tickets
      .filter((item) => {
        const date = item.exitAt || item.entryAt;
        if (item.status !== 'finalizado') return false;
        if (startDate && date < `${startDate}T00:00:00`) return false;
        if (endDate && date > `${endDate}T23:59:59`) return false;
        if (paymentFilter !== 'todos' && item.paymentMethod !== paymentFilter) return false;

        const q = search.trim().toUpperCase();
        if (!q) return true;
        return String(item.shortTicket || '').toUpperCase().includes(q) || String(item.plate || '').toUpperCase().includes(q);
      })
      .sort((a, b) => (b.exitAt || b.entryAt || '').localeCompare(a.exitAt || a.entryAt || ''));
  }, [endDate, paymentFilter, search, startDate, tickets]);

  const totals = useMemo(() => {
    const totalRevenue = filtered.reduce((sum, item) => sum + (item.amountCharged || 0), 0);
    const totalVehicles = filtered.length;
    return {
      totalRevenue,
      totalVehicles,
      exits: filtered.length,
      ticketAverage: totalVehicles ? totalRevenue / totalVehicles : 0,
    };
  }, [filtered]);

  const dailySummary = useMemo(
    () =>
      Object.entries(
        filtered.reduce<Record<string, number>>((acc, item) => {
          const key = (item.exitAt || item.entryAt || '').slice(0, 10);
          acc[key] = (acc[key] || 0) + (item.amountCharged || 0);
          return acc;
        }, {})
      ),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search, startDate, endDate, paymentFilter]);

  function exportCsv() {
    const header = ['Data', 'Cupom', 'Placa', 'Tipo', 'Valor', 'Pagamento', 'Descrição'];
    const rows = filtered.map((item) => [
      shortDateTime(item.exitAt || item.entryAt),
      item.shortTicket,
      item.plate || '-',
      item.vehicleType,
      String(item.amountCharged || 0).replace('.', ','),
      item.paymentMethod || '-',
      `Ticket ${item.shortTicket}`,
    ]);

    const csv = [header, ...rows].map((row) => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-smartpark.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 16;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('Relatório SmartPark', 14, y);
    y += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`${settings?.name || 'Estacionamento'} | Período: ${startDate || 'Início'} a ${endDate || 'Hoje'}`, 14, y);
    y += 8;

    const summaryLines = [
      `Faturamento Total: ${money(totals.totalRevenue)}`,
      `Total de Veículos: ${totals.totalVehicles}`,
      `Saídas Realizadas: ${totals.exits}`,
      `Ticket Médio: ${money(totals.ticketAverage)}`,
      `Forma de pagamento: ${paymentFilter === 'todos' ? 'Todas' : paymentFilter}`,
      '',
      'Transações:',
    ];

    pdf.text(summaryLines, 14, y);
    y += 38;

    filtered.slice(0, 30).forEach((item) => {
      if (y > 275) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFontSize(9);
      pdf.text(
        `${shortDateTime(item.exitAt || item.entryAt)} | Cupom ${item.shortTicket} | ${item.plate || '-'} | ${money(item.amountCharged || 0)} | ${item.paymentMethod || '-'}`,
        14,
        y
      );
      y += 6;
    });

    pdf.save('relatorio-smartpark.pdf');
  }

  return (
    <RoleGuard roles={['admin']}>
      <div>
        <PageHeader
          title="Relatórios"
          subtitle="Análise financeira e operacional"
          actions={
            <>
              <button className="secondary-button" onClick={exportCsv}><Download size={16} />Exportar CSV</button>
              <button className="primary-button" onClick={exportPdf}><FileText size={16} />Exportar PDF</button>
            </>
          }
        />

        <div className="panel-card mb-6 p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input className="app-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input className="app-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <select className="app-input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as 'todos' | PaymentMethod)}>
              <option value="todos">Todas as formas</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao">Cartão</option>
              <option value="mensalista">Mensalista</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="app-input pl-11" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número do cupom ou placa" />
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Faturamento Total" value={money(totals.totalRevenue)} icon={<Download size={20} />} />
          <StatCard title="Total de Veículos" value={String(totals.totalVehicles)} icon={<Printer size={20} />} tone="green" />
          <StatCard title="Saídas Realizadas" value={String(totals.exits)} icon={<Printer size={20} />} tone="red" />
          <StatCard title="Ticket Médio" value={money(totals.ticketAverage)} icon={<MessageCircleMore size={20} />} tone="slate" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <div className="panel-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Faturamento Diário</h2>
            <div className="mt-4 space-y-4">
              {dailySummary.map(([date, value]) => (
                <div key={date}>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600"><span>{date}</span><strong className="text-slate-900">{money(value)}</strong></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-blue-600" style={{ width: `${Math.min(100, (value / Math.max(totals.totalRevenue || 1, 1)) * 100)}%` }} /></div>
                </div>
              ))}
              {!filtered.length ? <p className="text-sm text-slate-500">Nenhum registro no período.</p> : null}
            </div>
          </div>

          <div className="panel-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Transações recentes</h2>
              <p className="text-sm text-slate-500">{filtered.length} encontradas</p>
            </div>
            <div className="table-shell mt-4 max-h-[560px] overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Cupom</th>
                    <th>Placa</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Comprovante</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length ? paginated.map((ticket) => {
                    const whatsappUrl = buildReceiptWhatsappUrl(ticket, settings?.name || 'Estacionamento');
                    return (
                      <tr key={ticket.id}>
                        <td>{shortDateTime(ticket.exitAt || ticket.entryAt)}</td>
                        <td>{ticket.shortTicket}</td>
                        <td>{ticket.plate || '-'}</td>
                        <td>{money(ticket.amountCharged)}</td>
                        <td>{ticket.paymentMethod || '-'}</td>
                        <td>
                          <div className="flex gap-2">
                            <button className="secondary-button py-2" onClick={() => openPrintPage(`/print/saida/${ticket.id}`)}><Printer size={16} /></button>
                            <a className={`secondary-button py-2 ${!whatsappUrl ? 'pointer-events-none opacity-50' : ''}`} href={whatsappUrl || '#'} target="_blank"><MessageCircleMore size={16} /></a>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={6}>Nenhum registro</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
              <div className="flex gap-3">
                <button className="secondary-button py-2" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
                <button className="secondary-button py-2" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
