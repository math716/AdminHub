'use client';

// Peças comuns do comparador de candidatos: cálculo do vencedor de cada área,
// balão do mapa, resumo, destaques e tabela. Usadas tanto na comparação por
// estado/cidade (comparador-candidatos) quanto dentro da cidade
// (comparacao-cidade) — um ajuste aqui vale para os dois níveis.

import { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cartaoTooltip } from '@/components/mapa/mapa-comparacao';

export interface Linha {
  chave: string;
  nome: string;
  /** Linha secundária na tabela (ex.: endereço e bairro do local). */
  detalhe?: string;
  votos: number[];
}

export interface Resultado {
  /** Índice do vencedor entre os candidatos; -1 = empate. */
  vencedor: number;
  /** Diferença do 1º para o 2º, em votos. */
  diferenca: number;
  /** Diferença como fração dos votos dos escolhidos na área (0–1). */
  folga: number;
  total: number;
}

export interface CandidatoNaComparacao {
  id: string;
  nome: string;
  partido: string;
  cor: string;
}

export const fmt = (n: number) => n.toLocaleString('pt-BR');
export const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Maiúsculo, sem acento e sem apóstrofo/hífen — para casar nomes de cidade e bairro. */
export const semAcento = (s: string) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/['’`´-]/g, ' ').replace(/\s+/g, ' ').trim();

export const COR_EMPATE = '#64748b';
export const COR_SEM_VOTO = '#cbd5e1';

export function resultado(votos: number[]): Resultado | null {
  const total = votos.reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const ordem = votos.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const diferenca = ordem[0].v - (ordem[1]?.v ?? 0);
  return { vencedor: diferenca === 0 ? -1 : ordem[0].i, diferenca, folga: diferenca / total, total };
}

/** Vantagem pequena clareia a cor; grande deixa forte. */
export function opacidadePorFolga(folga: number): number {
  if (folga < 0.05) return 0.35;
  if (folga < 0.15) return 0.6;
  return 0.85;
}

export function corDoResultado(r: Resultado | null, cores: string[]): string {
  if (!r) return COR_SEM_VOTO;
  return r.vencedor === -1 ? COR_EMPATE : cores[r.vencedor];
}

/** Balão do mapa: título, subtítulo opcional e os votos de cada candidato. */
export function htmlComparacao(
  titulo: string, subtitulo: string | null, cands: CandidatoNaComparacao[], votos: number[], r: Resultado,
): string {
  const linhas = cands.map((c, i) => {
    const pct = r.total ? ((votos[i] / r.total) * 100).toFixed(1).replace('.', ',') : '0';
    const venceu = r.vencedor === i;
    return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;">
      <span style="width:9px;height:9px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
      <span style="flex:1;color:var(--text-secondary);${venceu ? 'font-weight:700;color:var(--text-primary)' : ''}">${esc(c.nome)}</span>
      <span style="color:var(--text-primary);font-weight:600">${fmt(votos[i])}</span>
      <span style="color:var(--text-tertiary);font-size:11px;width:42px;text-align:right">${pct}%</span>
    </div>`;
  }).join('');
  const rodape = r.vencedor === -1 ? 'Empate entre os mais votados' : `Vantagem: ${fmt(r.diferenca)} votos`;
  return cartaoTooltip(
    `<div style="font-weight:600;color:var(--acento-azul);font-size:13px;margin-bottom:2px">${esc(titulo)}</div>` +
    (subtitulo ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${esc(subtitulo)}</div>` : '') +
    linhas +
    `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">${rodape}</div>`,
  );
}

export function useResultados(linhas: Linha[]) {
  return useMemo(() => linhas.map(l => ({ linha: l, r: resultado(l.votos) })), [linhas]);
}

// ── Legenda ──────────────────────────────────────────────────────────────────
export function LegendaComparacao({ cands }: { cands: CandidatoNaComparacao[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      {cands.map(c => (
        <span key={c.id} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: c.cor }} />{c.nome}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="flex">
          {[0.35, 0.6, 0.85].map(o => <span key={o} className="w-3 h-3" style={{ background: '#94a3b8', opacity: o }} />)}
        </span>
        vantagem pequena → grande
      </span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COR_SEM_VOTO }} />sem votos</span>
    </div>
  );
}

// ── Resumo ───────────────────────────────────────────────────────────────────
export function ResumoComparacao({ cands, linhas, nomeArea, extra }: {
  cands: CandidatoNaComparacao[];
  linhas: Linha[];
  /** Plural da área: "cidades", "bairros", "locais de votação"… */
  nomeArea: string;
  /** Texto a mais na contagem (ex.: " + exterior"). */
  extra?: { descontar: number; texto: string };
}) {
  const resultados = useResultados(linhas);
  const comVoto = resultados.filter(x => x.r).length;
  const empates = resultados.filter(x => x.r?.vencedor === -1).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Resumo</CardTitle>
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {fmt(comVoto - (extra?.descontar ?? 0))} {nomeArea} com votos{extra?.texto ?? ''}
          {empates ? ` · ${empates} empate${empates > 1 ? 's' : ''}` : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {cands.map((c, i) => {
          const votos = linhas.reduce((s, l) => s + l.votos[i], 0);
          const vitorias = resultados.filter(x => x.r?.vencedor === i).length;
          const pct = comVoto ? Math.round((vitorias / comVoto) * 100) : 0;
          return (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.cor }} />
                <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.partido}</span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs pl-5">
                <span style={{ color: 'var(--text-secondary)' }}>{fmt(votos)} votos</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  venceu em <strong style={{ color: 'var(--text-primary)' }}>{fmt(vitorias)}</strong> {nomeArea}
                </span>
              </div>
              <div className="h-1.5 rounded-full ml-5" style={{ background: 'var(--tint-08)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.cor }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Destaques + tabela completa ──────────────────────────────────────────────
export function DetalhesComparacao({ cands, linhas, rotuloArea, todasAsAreas, onClickLinha, dicaClique }: {
  cands: CandidatoNaComparacao[];
  linhas: Linha[];
  /** Cabeçalho da 1ª coluna: "Cidade", "Bairro", "Local de votação"… */
  rotuloArea: string;
  /** Título da tabela: "Todas as cidades", "Todos os bairros"… */
  todasAsAreas: string;
  onClickLinha?: (linha: Linha) => void;
  dicaClique?: string;
}) {
  const resultados = useResultados(linhas);
  const [ordem, setOrdem] = useState<{ por: 'nome' | 'dif' | number; desc: boolean }>({ por: 'dif', desc: false });

  // Destaques são exemplos — a tabela abaixo traz todas as áreas.
  const disputadas = resultados.filter(x => x.r && x.linha.votos.filter(v => v > 0).length >= 2);
  const apertadas = [...disputadas].sort((a, b) => a.r!.folga - b.r!.folga).slice(0, 5);
  const folgadas = [...disputadas].sort((a, b) => b.r!.folga - a.r!.folga).slice(0, 5);

  const ordenadas = useMemo(() => {
    const sinal = ordem.desc ? -1 : 1;
    return [...resultados].sort((a, b) => {
      if (ordem.por === 'nome') return sinal * a.linha.nome.localeCompare(b.linha.nome, 'pt-BR', { numeric: true });
      if (ordem.por === 'dif') return sinal * ((a.r?.folga ?? 2) - (b.r?.folga ?? 2));
      return sinal * (a.linha.votos[ordem.por] - b.linha.votos[ordem.por]);
    });
  }, [resultados, ordem]);
  const ordenarPor = (por: 'nome' | 'dif' | number) =>
    setOrdem(o => ({ por, desc: o.por === por ? !o.desc : por !== 'nome' && por !== 'dif' }));

  return (
    <>
      {disputadas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { titulo: 'Disputas mais apertadas', itens: apertadas },
            { titulo: 'Maiores vantagens (em %)', itens: folgadas },
          ].map(bloco => (
            <Card key={bloco.titulo}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{bloco.titulo}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {bloco.itens.map(({ linha, r }) => (
                  <div key={linha.chave} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: corDoResultado(r, cands.map(c => c.cor)) }} />
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>{linha.nome}</span>
                    <span className="flex-shrink-0 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {r!.vencedor === -1 ? 'empate' : `${cands[r!.vencedor].nome} por ${fmt(r!.diferenca)}`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{todasAsAreas} ({fmt(linhas.length)})</CardTitle>
          {dicaClique && <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{dicaClique}</p>}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[560px] scrollbar-dark">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-card)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className="text-left font-semibold px-3 py-2 sticky left-0 z-10 min-w-[160px]" style={{ background: 'var(--bg-card)' }}>
                    <button type="button" onClick={() => ordenarPor('nome')} className="flex items-center gap-1">
                      {rotuloArea} <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                  {cands.map((c, i) => (
                    <th key={c.id} className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => ordenarPor(i)} className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.cor }} />{c.nome}
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    </th>
                  ))}
                  <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                    <button type="button" onClick={() => ordenarPor('dif')} className="inline-flex items-center gap-1">
                      Vantagem <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(({ linha, r }) => (
                  <tr key={linha.chave}
                    onClick={onClickLinha ? () => onClickLinha(linha) : undefined}
                    className={onClickLinha ? 'cursor-pointer hover:bg-[var(--tint-06)]' : undefined}
                    style={{ borderBottom: '1px solid var(--tint-06)' }}>
                    <td className="px-3 py-1.5 sticky left-0 font-medium" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                      <span className="flex items-start gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: corDoResultado(r, cands.map(c => c.cor)) }} />
                        <span className="min-w-0">
                          <span className="block">{linha.nome}</span>
                          {linha.detalhe && <span className="block text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>{linha.detalhe}</span>}
                        </span>
                      </span>
                    </td>
                    {linha.votos.map((v, i) => (
                      <td key={i} className="px-3 py-1.5 text-right tabular-nums"
                        style={{ color: r?.vencedor === i ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: r?.vencedor === i ? 700 : 400 }}>
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {!r ? '—' : r.vencedor === -1 ? 'empate' : `${fmt(r.diferenca)} (${(r.folga * 100).toFixed(1).replace('.', ',')}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
