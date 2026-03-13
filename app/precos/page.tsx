"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Tag } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RoleGuard from '@/components/RoleGuard';
import { db } from '@/lib/firebase';
import { PriceSetting, VehicleType } from '@/types';
import { money, toInputNumber } from '@/utils/format';

const vehicleTypes: VehicleType[] = ['CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO'];
const baseRows = vehicleTypes.map((vehicleType) => ({ vehicleType, valorHora: 0, valorAdicional: 0, diariaMaxima: 0, pernoite: 0, mensalista: 0, tolerancia: 0, active: true }));

export default function PrecosPage() {
  const [rows, setRows] = useState<PriceSetting[]>(baseRows);
  const [editing, setEditing] = useState<PriceSetting | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'priceSettings'), (snap) => {
      if (snap.empty) return setRows(baseRows);
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PriceSetting, 'id'>) }));
      setRows(vehicleTypes.map((type) => items.find((item) => item.vehicleType === type) || baseRows.find((row) => row.vehicleType === type)!));
    });
    return () => unsub();
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    await setDoc(doc(db, 'priceSettings', editing.vehicleType), { ...editing, updatedAt: new Date().toISOString(), active: true });
    setEditing(null);
  }

  const activeLabel = useMemo(() => editing ? `Editar - ${editing.vehicleType}` : '', [editing]);

  return (
    <RoleGuard roles={['admin']}>
      <div>
        <PageHeader title="Tabela de Preços" subtitle="Configure os valores por tipo de veículo" />
        {editing ? (
          <div className="panel-card mb-6 p-6">
            <h2 className="text-lg font-semibold text-slate-900">{activeLabel}</h2>
            <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSave}>
              <input className="app-input" placeholder="1ª Hora (R$)" value={editing.valorHora} onChange={(e) => setEditing({ ...editing, valorHora: toInputNumber(e.target.value) })} />
              <input className="app-input" placeholder="Hora Adicional (R$)" value={editing.valorAdicional} onChange={(e) => setEditing({ ...editing, valorAdicional: toInputNumber(e.target.value) })} />
              <input className="app-input" placeholder="Diária Máx (R$)" value={editing.diariaMaxima || 0} onChange={(e) => setEditing({ ...editing, diariaMaxima: toInputNumber(e.target.value) })} />
              <input className="app-input" placeholder="Pernoite (R$)" value={editing.pernoite || 0} onChange={(e) => setEditing({ ...editing, pernoite: toInputNumber(e.target.value) })} />
              <input className="app-input" placeholder="Mensalista (R$)" value={editing.mensalista || 0} onChange={(e) => setEditing({ ...editing, mensalista: toInputNumber(e.target.value) })} />
              <input className="app-input" placeholder="Tolerância (min)" value={editing.tolerancia} onChange={(e) => setEditing({ ...editing, tolerancia: Number(e.target.value || 0) })} />
              <div className="xl:col-span-3 flex gap-3">
                <button className="primary-button" type="submit">Salvar</button>
                <button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-4 md:grid-cols-2">
          {rows.map((row) => (
            <button key={row.vehicleType} className="panel-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => setEditing(row)}>
              <div className="mb-4 flex items-center justify-between">
                <div className="icon-soft-blue"><Tag size={18} /></div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Ativo</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{row.vehicleType}</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between"><span>1ª Hora</span><strong>{money(row.valorHora)}</strong></div>
                <div className="flex justify-between"><span>Hora Adicional</span><strong>{money(row.valorAdicional)}</strong></div>
                <div className="flex justify-between"><span>Diária Máxima</span><strong>{money(row.diariaMaxima)}</strong></div>
                <div className="flex justify-between"><span>Pernoite</span><strong>{money(row.pernoite)}</strong></div>
                <div className="flex justify-between"><span>Mensalista</span><strong>{money(row.mensalista)}</strong></div>
                <div className="flex justify-between"><span>Tolerância</span><strong>{row.tolerancia} min</strong></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}
