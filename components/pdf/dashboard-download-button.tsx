'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardDownloadButtonProps {
  disabled?: boolean;
}

export default function DashboardDownloadButton({ disabled }: DashboardDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/dashboard/report');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setError(false); handleGenerate(); }}
        className="gap-2 text-xs text-red-500 border-red-300 hover:bg-red-50"
      >
        <FileDown className="h-3.5 w-3.5" />
        Erro — tentar novamente
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={loading || disabled}
      className="gap-2 text-xs"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5" />
      )}
      {loading ? 'Gerando PDF...' : 'Gerar Relatório'}
    </Button>
  );
}
