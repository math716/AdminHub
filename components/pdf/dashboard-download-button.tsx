'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy-load heavy PDF components to avoid SSR issues
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => ({ default: m.PDFDownloadLink })),
  { ssr: false, loading: () => null }
);

const DashboardReport = dynamic(
  () => import('./dashboard-report'),
  { ssr: false, loading: () => null }
);

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
  const [clicked, setClicked] = useState(false);

  if (!stats) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 text-xs">
        <FileDown className="h-3.5 w-3.5" />
        Gerar Relatório
      </Button>
    );
  }

  // Only render PDFDownloadLink after first click (avoids eager PDF generation on page load)
  if (!clicked) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setClicked(true)}
        className="gap-2 text-xs"
      >
        <FileDown className="h-3.5 w-3.5" />
        Gerar Relatório
      </Button>
    );
  }

  const fileName = `relatorio-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;

  return (
    <PDFDownloadLink
      document={<DashboardReport gabineteName={gabineteName} stats={stats} />}
      fileName={fileName}
    >
      {({ loading, error }) => {
        if (error) {
          return (
            <Button variant="outline" size="sm" className="gap-2 text-xs text-red-500" onClick={() => setClicked(false)}>
              <FileDown className="h-3.5 w-3.5" />
              Erro — tentar novamente
            </Button>
          );
        }
        if (loading) {
          return (
            <Button variant="outline" size="sm" disabled className="gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Gerando PDF...
            </Button>
          );
        }
        return (
          <Button variant="outline" size="sm" className="gap-2 text-xs text-blue-600 border-blue-300 hover:bg-blue-50">
            <FileDown className="h-3.5 w-3.5" />
            Baixar Relatório
          </Button>
        );
      }}
    </PDFDownloadLink>
  );
}
