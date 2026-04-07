'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import ClientsManager from './ClientsManager';
import { useAuth } from '@/contexts/AuthContext';

export default function SupportClientsPage() {
  const router = useRouter();
  const { loading, profile } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace('/login');
      return;
    }
    const role = String(profile.role ?? profile.cargo ?? '').toLowerCase();
    if (role !== 'suporte' && role !== 'admin' && role !== 'administrador') {
      router.replace('/');
    }
  }, [loading, profile, router]);

  if (loading || !profile) {
    return <div className="panel-card p-6 text-sm text-slate-500">Carregando módulo de suporte...</div>;
  }

  const role = String(profile.role ?? profile.cargo ?? '').toLowerCase();
  if (role !== 'suporte' && role !== 'admin' && role !== 'administrador') {
    return <div className="panel-card p-6 text-sm text-slate-500">Redirecionando...</div>;
  }

  return <ClientsManager />;
}
