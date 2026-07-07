'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Direct imports — this component is loaded with ssr:false from the dashboard page
import { pdf } from '@react-pdf/renderer';
import DashboardReport from './dashboard-report';

interface DashboardDownloadButtonProps {
  gabineteName: string;
  stats: {
    total: number;
    pendentes: number;
    emAndamento: number;
    resolvidas: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    recentDemands: any[];
    timeline: { date: string; count: number; resolved: number }[];
    lastResolvedDate: string | null;
  } | null;
}

export default function DashboardDownloadButton({ gabineteName, stats }: DashboardDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleGenerate = async () => {
    if (!stats) return;
    setLoading(true);
    setError(false);
    try {
      const doc = <DashboardReport gabineteName={gabineteName} stats={stats} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation error:', err);
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
      disabled={loading || !stats}
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
