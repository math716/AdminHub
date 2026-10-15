'use client';

// Botão "Baixar PDF" do comparador e da evolução: manda para
// /api/agent/relatorio (tipo 'comparacao') o que a tela já calculou e baixa
// o documento.

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  tipo: 'comparacao' | 'evolucao';
  titulo: string;
  subtitulo?: string;
  colunas: string[];
  cores?: string[];
  rotuloArea: string;
  linhas: Array<{ nome: string; valores: number[] }>;
  /** Mapa do Brasil ou do estado; a cidade sai só com a tabela. */
  mapa?: { tipo: 'brasil' | 'estado'; uf?: string };
  /** Cor de cada área do mapa — chave = sigla da UF ou nome da cidade. */
  coresMapa?: Record<string, { cor: string; opacidade: number }>;
}

export function BotaoPdfComparacao({ tipo, titulo, subtitulo, colunas, cores, rotuloArea, linhas, mapa, coresMapa }: Props) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(false);

  const baixar = async () => {
    setGerando(true);
    setErro(false);
    try {
      const res = await fetch('/api/agent/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'comparacao',
          comparacao: {
            modo: tipo === 'evolucao' ? 'evolucao' : 'vencedor',
            titulo, subtitulo, colunas, cores, rotuloArea, linhas,
            mapa: mapa && coresMapa ? { ...mapa, cores: coresMapa } : undefined,
          },
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${titulo.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 80) || 'comparacao'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setErro(true);
    } finally {
      setGerando(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={baixar} disabled={gerando || linhas.length === 0}>
        {gerando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
        Baixar PDF
      </Button>
      {erro && <span className="text-[11px]" style={{ color: 'var(--danger)' }}>Não foi possível gerar o PDF. Tente de novo.</span>}
    </span>
  );
}
