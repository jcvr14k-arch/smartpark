import { ReactNode } from 'react';

export default function StatCard({
  title,
  value,
  icon,
  hint,
  tone = 'blue',
}: {
  title: string;
  value: string;
  icon: ReactNode;
  hint?: string;
  tone?: 'blue' | 'green' | 'red' | 'slate';
}) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="panel-card p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500 lg:text-sm lg:font-medium">{title}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 lg:mt-2 lg:text-3xl lg:font-semibold">{value}</h3>
          {hint ? <p className="mt-1 text-xs text-slate-500 lg:mt-2 lg:text-sm">{hint}</p> : null}
        </div>
        <div className={`rounded-lg p-2.5 lg:rounded-2xl lg:p-3 ${toneMap[tone]} shadow-sm flex-shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}
