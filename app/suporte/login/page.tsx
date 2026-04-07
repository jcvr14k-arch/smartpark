'use client';

import Link from 'next/link';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function SupportLoginPage() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-app px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl items-center justify-center">
        <div className="panel-card w-full max-w-xl overflow-hidden rounded-[32px] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 bg-slate-50/70 px-8 py-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
              <LifeBuoy size={16} />
              Área exclusiva do suporte SmartPark
            </div>
            <h1 className="mt-5 text-3xl font-semibold text-slate-950">Acesso pelo login principal</h1>
          </div>

          <div className="space-y-4 px-8 py-8 md:px-10 md:py-10">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Faça login normalmente em <span className="font-semibold text-slate-900">/login</span> e depois acesse <span className="font-semibold text-slate-900">/suporte/clientes</span>.
            </div>

            {profile ? (
              <Link className="primary-button h-12 w-full justify-center" href={profile.role === 'suporte' ? '/suporte/clientes' : '/'}>
                <ShieldCheck size={16} />
                Ir para o painel de suporte
              </Link>
            ) : (
              <Link className="primary-button h-12 w-full justify-center" href="/login">
                <ShieldCheck size={16} />
                Ir para o login
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
