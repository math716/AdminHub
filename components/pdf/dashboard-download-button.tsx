'use client';

import { useState } from 'react';
import { FileDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Periodo = 'MENSAL' | 'ANUAL' | 'CUSTOM';

interface DashboardDownloadButtonProps {
  disabled?: boolean;
}

export default function DashboardDownloadButton({ disabled }: DashboardDownloadButtonProps) {
  const [showSelector, setShowSelector] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(false);
  const [periodo, setPeriodo]           = useState<Periodo>('MENSAL');
  const [dataInicio, setDataInicio]     = useState('');
  const [dataFim, setDataFim]           = useState('');

  const hoje = new Date().toISOString().split('T')[0];

  const handleGenerate = async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ periodo });
      if (periodo === 'CUSTOM') {
        if (dataInicio) params.set('dataInicio', dataInicio);
        if (dataFim)    params.set('dataFim',    dataFim);
      }
      const res = await fetch(`/api/dashboard/report?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `relatorio-dashboard-${hoje}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowSelector(false);
    } catch (err) {
      console.error('PDF download error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (showSelector) {
    return (
      <div
        className="flex flex-col gap-3 p-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', minWidth: 260 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[color:var(--text-primary)] uppercase tracking-wide">Período do relatório</span>
          <button onClick={() => setShowSelector(false)} className="text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {(['MENSAL', 'ANUAL', 'CUSTOM'] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors"
              style={periodo === p
                ? { background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }
                : { color: 'var(--text-secondary)' }}
            >
              <span
                className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                style={{ borderColor: periodo === p ? 'var(--brand-cobalt)' : 'var(--border-default)' }}
              >
                {periodo === p && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brand-cobalt)' }} />}
              </span>
              {p === 'MENSAL'  && 'Mensal (últimos 30 dias)'}
              {p === 'ANUAL'   && `Anual (${new Date().getFullYear()})`}
              {p === 'CUSTOM'  && 'Período personalizado'}
            </button>
          ))}
        </div>

        {periodo === 'CUSTOM' && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wide">De</label>
              <input
                type="date"
                value={dataInicio}
                max={dataFim || hoje}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wide">Até</label>
              <input
                type="date"
                value={dataFim}
                min={dataInicio}
                max={hoje}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">Erro ao gerar PDF. Tente novamente.</p>
        )}

        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={loading || (periodo === 'CUSTOM' && (!dataInicio || !dataFim))}
          className="gap-2 text-xs w-full"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          {loading ? 'Gerando PDF...' : 'Gerar PDF'}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => { setError(false); setShowSelector(true); }}
      disabled={disabled}
      className="gap-2 text-xs"
    >
      <FileDown className="h-3.5 w-3.5" />
      Gerar Relatório
    </Button>
  );
}
