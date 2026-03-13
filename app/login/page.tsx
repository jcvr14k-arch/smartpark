"use client";

import { FormEvent, useState } from 'react';
import { CarFront, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@parksmart.com');
  const [password, setPassword] = useState('Kimosabe');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err?.message || 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-app px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl items-center gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="hidden rounded-[36px] bg-gradient-to-br from-blue-700 to-blue-500 p-10 text-white xl:block">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/15"><CarFront size={26} /></div>
          <h1 className="mt-8 text-4xl font-semibold">SmartPark</h1>
          <p className="mt-4 max-w-lg text-white/80">Seu Estacionamento Inteligente.</p>
        </div>
        <div className="panel-card p-8 md:p-10">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold text-slate-900">Entrar</h2>
            <p className="mt-2 text-sm text-slate-500">Use suas credenciais para acessar o sistema.</p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">E-mail</label>
              <div className="relative"><Mail className="absolute left-4 top-3.5 text-slate-400" size={18} /><input className="app-input pl-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Senha</label>
              <div className="relative"><LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={18} /><input className="app-input pl-11" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            </div>
            {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
            <button className="primary-button w-full justify-center" disabled={loading}>{loading ? 'Entrando...' : 'Acessar SmartPark'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
