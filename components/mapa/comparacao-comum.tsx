'use client';

// Peças comuns do comparador de candidatos: cálculo do vencedor de cada área,
// balão do mapa, resumo, destaques e tabela. Usadas tanto na comparação por
// estado/cidade (comparador-candidatos) quanto dentro da cidade
// (comparacao-cidade) — um ajuste aqui vale para os dois níveis.

import { useMemo, useState } from 'react';
import { ArrowUpDown, Crown, List, MousePointerClick, Scale, Trophy } from 'lucide-react';
import { campoDoPartido, NOME_CAMPO } from '@/lib/partidos-espectro';
import { cartaoTooltip } from '@/components/mapa/mapa-comparacao';
import {
  Avatar, BarraDividida, CampoFiltro, ChipFiltro, Etiqueta, LegendaMapa, Painel, Rosca, comAlfa, pctBR,
} from '@/components/mapa/comparacao-visual';

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

const SINGULAR: Record<string, string> = {
  cidades: 'cidade', estados: 'estado', bairros: 'bairro', zonas: 'zona', distritos: 'distrito',
  'regiões administrativas': 'região administrativa', 'locais de votação': 'local de votação',
};
/** "1 cidade", "2 cidades" — a área vem sempre no plural. */
export const contagem = (n: number, plural: string) => `${fmt(n)} ${n === 1 ? SINGULAR[plural] ?? plural : plural}`;

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
  const ordem = cands.map((c, i) => ({ c, i })).sort((a, b) => votos[b.i] - votos[a.i]);
  const linhas = ordem.map(({ c, i }) => {
    const fracao = r.total ? votos[i] / r.total : 0;
    const pct = (fracao * 100).toFixed(1).replace('.', ',');
    const venceu = r.vencedor === i;
    return `<div style="margin-top:7px;font-size:12px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
        <span style="flex:1;color:var(--text-secondary);${venceu ? 'font-weight:700;color:var(--text-primary)' : ''}">${esc(c.nome)}</span>
        <span style="color:var(--text-primary);font-weight:600;font-variant-numeric:tabular-nums">${fmt(votos[i])}</span>
        <span style="color:var(--text-tertiary);font-size:11px;width:40px;text-align:right;font-variant-numeric:tabular-nums">${pct}%</span>
      </div>
      <div style="height:4px;border-radius:4px;background:var(--tint-08);margin:4px 0 0 14px;overflow:hidden">
        <div style="height:100%;width:${(fracao * 100).toFixed(1)}%;background:${c.cor};border-radius:4px"></div>
      </div>
    </div>`;
  }).join('');
  const venc = r.vencedor === -1 ? null : cands[r.vencedor];
  const rodape = venc
    ? `<span style="color:${venc.cor};font-weight:700">${esc(venc.nome)}</span> venceu por ${fmt(r.diferenca)} votos`
    : 'Empate entre os mais votados';
  return cartaoTooltip(
    `<div style="font-weight:700;color:var(--text-primary);font-size:13px">${esc(titulo)}</div>` +
    (subtitulo ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:1px">${esc(subtitulo)}</div>` : '') +
    linhas +
    `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--tint-08);font-size:11px;color:var(--text-tertiary)">${rodape}</div>`,
  );
}

export function useResultados(linhas: Linha[]) {
  return useMemo(() => linhas.map(l => ({ linha: l, r: resultado(l.votos) })), [linhas]);
}



// ── Legenda do mapa ──────────────────────────────────────────────────────────
export function LegendaComparacao({ cands }: { cands: CandidatoNaComparacao[] }) {
  return (
    <LegendaMapa
      itens={cands.map(c => ({ chave: c.id, cor: c.cor, rotulo: c.nome }))}
      escala={{ inicio: 'vantagem pequena', fim: 'grande' }}
      semVoto={{ cor: COR_SEM_VOTO, rotulo: 'sem votos' }}
    />
  );
}

function useTotais(cands: CandidatoNaComparacao[], linhas: Linha[]) {
  const resultados = useResultados(linhas);
  return useMemo(() => {
    const totais = cands.map((_, i) => linhas.reduce((s, l) => s + l.votos[i], 0));
    const vitorias = cands.map((_, i) => resultados.filter(x => x.r?.vencedor === i).length);
    const comVoto = resultados.filter(x => x.r).length;
    const empates = resultados.filter(x => x.r?.vencedor === -1).length;
    return { resultados, totais, soma: totais.reduce((s, v) => s + v, 0), vitorias, comVoto, empates };
  }, [cands, linhas, resultados]);
}

// ── Placar ───────────────────────────────────────────────────────────────────
/** Cabeçalho do confronto: cada candidato com o total e a fatia dos votos. */
export function PlacarComparacao({ cands, linhas, nomeArea }: {
  cands: CandidatoNaComparacao[];
  linhas: Linha[];
  /** Plural da área: "cidades", "bairros", "locais de votação"… */
  nomeArea: string;
}) {
  const { totais, soma, vitorias } = useTotais(cands, linhas);
  const lider = totais.indexOf(Math.max(...totais));
  const duelo = cands.length === 2;
  const fundo = duelo
    ? `linear-gradient(100deg, ${comAlfa(cands[0].cor, 0.10)} 0%, transparent 40%, transparent 60%, ${comAlfa(cands[1].cor, 0.10)} 100%)`
    : `linear-gradient(180deg, ${comAlfa(cands[lider]?.cor ?? '#2563eb', 0.07)} 0%, transparent 70%)`;

  const cartao = (c: CandidatoNaComparacao, i: number) => {
    const espelho = duelo && i === 1;
    return (
      <div key={c.id} className={`min-w-0 flex flex-col gap-2.5 ${espelho ? 'items-end text-right' : ''} ${duelo ? '' : 'rounded-xl p-3 sm:p-4'}`}
        style={duelo ? undefined : { background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)', boxShadow: `inset 0 3px 0 ${c.cor}` }}>
        <div className={`flex gap-2 sm:gap-3 ${duelo ? 'flex-col sm:flex-row' : ''} ${espelho ? 'items-end sm:flex-row-reverse' : duelo ? 'items-start sm:items-center' : 'items-center'}`}>
          <Avatar nome={c.nome} cor={c.cor} tamanho={duelo ? 48 : 40} />
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {c.partido} · {NOME_CAMPO[campoDoPartido(c.partido)]}
            </p>
          </div>
        </div>
        <div>
          <p className={`${duelo ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'} font-bold tabular-nums tracking-tight leading-none`} style={{ color: 'var(--text-primary)' }}>
            {fmt(totais[i])}
          </p>
          <p className="text-[10px] uppercase tracking-widest font-semibold mt-1" style={{ color: 'var(--text-tertiary)' }}>votos</p>
        </div>
        <div className={`flex flex-wrap items-center gap-1.5 ${espelho ? 'justify-end' : ''}`}>
          <Etiqueta cor={c.cor} forte={i === lider}>{soma ? pctBR(totais[i] / soma) : '—'}</Etiqueta>
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            venceu em <strong style={{ color: 'var(--text-primary)' }}>{contagem(vitorias[i], nomeArea)}</strong>
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', backgroundImage: fundo, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
      <div className="p-4 sm:p-6">
        {duelo ? (
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-6 items-center">
            {cartao(cands[0], 0)}
            <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs sm:text-sm font-black self-center"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', boxShadow: 'var(--shadow-card)' }}>
              VS
            </span>
            {cartao(cands[1], 1)}
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${cands.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-3`}>
            {cands.map(cartao)}
          </div>
        )}
        <div className="mt-5 sm:mt-6">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <span>Divisão dos votos</span>
            <span className="tabular-nums">{fmt(soma)} no total</span>
          </div>
          <BarraDividida altura={24} rotulos="pct"
            partes={cands.map((c, i) => ({ chave: c.id, valor: totais[i], cor: c.cor, rotulo: `${c.nome}: ${fmt(totais[i])}` }))} />
        </div>
      </div>
    </section>
  );
}

// ── Vitórias ─────────────────────────────────────────────────────────────────
const FAIXAS = [
  { chave: 'apertada', rotulo: 'Apertada', dica: 'menos de 5% de vantagem', opacidade: 0.35, ate: 0.05 },
  { chave: 'clara', rotulo: 'Clara', dica: 'de 5% a 15% de vantagem', opacidade: 0.6, ate: 0.15 },
  { chave: 'folgada', rotulo: 'Folgada', dica: 'mais de 15% de vantagem', opacidade: 0.9, ate: Infinity },
] as const;

/** Rosca das áreas vencidas e a força dessas vitórias. */
export function PainelVitorias({ cands, linhas, nomeArea, extra }: {
  cands: CandidatoNaComparacao[];
  linhas: Linha[];
  nomeArea: string;
  /** Áreas que não contam na contagem (ex.: exterior) e o texto que as explica. */
  extra?: { descontar: number; texto: string };
}) {
  const { resultados, vitorias, comVoto, empates } = useTotais(cands, linhas);
  const forca = cands.map((_, i) => FAIXAS.map((f, k) => resultados.filter(x =>
    x.r?.vencedor === i && x.r.folga < f.ate && (k === 0 || x.r.folga >= FAIXAS[k - 1].ate)).length));

  return (
    <Painel titulo="Onde cada um venceu" icone={Trophy}>
      <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-5">
        <Rosca
          fatias={[
            ...cands.map((c, i) => ({ chave: c.id, valor: vitorias[i], cor: c.cor })),
            { chave: 'empate', valor: empates, cor: COR_EMPATE },
          ]}
          centro={fmt(comVoto - (extra?.descontar ?? 0))}
          rotuloCentro={`${nomeArea}${extra?.texto ?? ''}`}
        />
        <ul className="flex-1 w-full min-w-0 space-y-2.5">
          {cands.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.cor }} />
              <span className="flex-1 min-w-0 font-medium break-words" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
              <span className="tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(vitorias[i])}</span>
              <span className="tabular-nums w-11 text-right" style={{ color: 'var(--text-tertiary)' }}>{comVoto ? pctBR(vitorias[i] / comVoto, 0) : '—'}</span>
            </li>
          ))}
          {empates > 0 && (
            <li className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COR_EMPATE }} />
              <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>Empate</span>
              <span className="tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(empates)}</span>
              <span className="tabular-nums w-11 text-right" style={{ color: 'var(--text-tertiary)' }}>{pctBR(empates / comVoto, 0)}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="mt-5 pt-4 space-y-3" style={{ borderTop: '1px solid var(--tint-06)' }}>
        <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Força das vitórias</p>
        {cands.map((c, i) => (
          <div key={c.id} className="space-y-1">
            <p className="text-[11px] font-medium break-words" style={{ color: 'var(--text-secondary)' }}>{c.nome}</p>
            {vitorias[i] === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Nenhuma vitória</p>
            ) : (
              <BarraDividida altura={18} arredondada={false} rotulos="valor"
                partes={FAIXAS.map((f, k) => ({
                  chave: f.chave, valor: forca[i][k], cor: c.cor, opacidade: f.opacidade,
                  rotulo: `${f.rotulo} (${f.dica}): ${fmt(forca[i][k])}`,
                }))} />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {FAIXAS.map(f => (
            <span key={f.chave} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }} title={f.dica}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: comAlfa('#64748b', f.opacidade) }} />
              {f.rotulo} <span className="hidden sm:inline">({f.dica})</span>
            </span>
          ))}
        </div>
      </div>
    </Painel>
  );
}

// ── Destaques ────────────────────────────────────────────────────────────────
/** Exemplos: as disputas mais apertadas e as vitórias mais folgadas. A tabela traz todas. */
export function DestaquesComparacao({ cands, linhas }: { cands: CandidatoNaComparacao[]; linhas: Linha[] }) {
  const resultados = useResultados(linhas);
  const disputadas = resultados.filter(x => x.r && x.linha.votos.filter(v => v > 0).length >= 2);
  if (disputadas.length === 0) return null;
  const apertadas = [...disputadas].sort((a, b) => a.r!.folga - b.r!.folga).slice(0, 5);
  const folgadas = [...disputadas].sort((a, b) => b.r!.folga - a.r!.folga).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { titulo: 'Disputas mais apertadas', icone: Scale, itens: apertadas },
        { titulo: 'Vitórias mais folgadas', icone: Crown, itens: folgadas },
      ].map(bloco => (
        <Painel key={bloco.titulo} titulo={bloco.titulo} icone={bloco.icone}>
          <ul className="space-y-3.5">
            {bloco.itens.map(({ linha, r }) => {
              const venc = r!.vencedor === -1 ? null : cands[r!.vencedor];
              return (
                <li key={linha.chave}>
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className="text-xs font-medium min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{linha.nome}</span>
                    {venc ? (
                      <span title={`${venc.nome} venceu por ${fmt(r!.diferenca)} votos`}>
                        <Etiqueta cor={venc.cor}>{venc.nome} +{pctBR(r!.folga)}</Etiqueta>
                      </span>
                    ) : <Etiqueta cor={COR_EMPATE}>empate</Etiqueta>}
                  </div>
                  <BarraDividida altura={6}
                    partes={cands.map((c, i) => ({ chave: c.id, valor: linha.votos[i], cor: c.cor, rotulo: `${c.nome}: ${fmt(linha.votos[i])}` }))} />
                </li>
              );
            })}
          </ul>
        </Painel>
      ))}
    </div>
  );
}

// ── Tabela completa ──────────────────────────────────────────────────────────
export function TabelaComparacao({ cands, linhas, rotuloArea, todasAsAreas, onClickLinha, dicaClique }: {
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
  const [texto, setTexto] = useState('');
  const [quem, setQuem] = useState<'todos' | 'empate' | number>('todos');

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

  const alvo = semAcento(texto);
  const visiveis = ordenadas.filter(({ linha, r }) =>
    (quem === 'todos' || (quem === 'empate' ? r?.vencedor === -1 : r?.vencedor === quem)) &&
    (!alvo || semAcento(`${linha.nome} ${linha.detalhe ?? ''}`).includes(alvo)));
  const contar = (q: 'empate' | number) => resultados.filter(x => (q === 'empate' ? x.r?.vencedor === -1 : x.r?.vencedor === q)).length;
  const empates = contar('empate');

  const Cabeca = ({ por, children, alinhar = 'right' }: { por: 'nome' | 'dif' | number; children: React.ReactNode; alinhar?: 'left' | 'right' }) => (
    <button type="button" onClick={() => ordenarPor(por)}
      className={`inline-flex items-center gap-1 uppercase tracking-wider ${alinhar === 'right' ? 'flex-row-reverse' : ''}`}>
      <ArrowUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />{children}
    </button>
  );

  return (
    <Painel
      titulo={<>{todasAsAreas} <span className="normal-case tracking-normal font-semibold">({fmt(linhas.length)})</span></>}
      icone={List}
      direita={<CampoFiltro valor={texto} onChange={setTexto} placeholder={`Filtrar por ${rotuloArea.toLowerCase()}…`} />}
      corpo="pt-3"
    >
      <div className="px-4 sm:px-5 pb-3 flex flex-wrap items-center gap-1.5">
        <ChipFiltro ativo={quem === 'todos'} onClick={() => setQuem('todos')}>Todos · {fmt(linhas.length)}</ChipFiltro>
        {cands.map((c, i) => (
          <ChipFiltro key={c.id} ativo={quem === i} cor={c.cor} onClick={() => setQuem(quem === i ? 'todos' : i)}>
            {c.nome} venceu · {fmt(contar(i))}
          </ChipFiltro>
        ))}
        {empates > 0 && (
          <ChipFiltro ativo={quem === 'empate'} cor={COR_EMPATE} onClick={() => setQuem(quem === 'empate' ? 'todos' : 'empate')}>
            Empates · {fmt(empates)}
          </ChipFiltro>
        )}
        {dicaClique && (
          <span className="text-[11px] flex items-center gap-1 sm:ml-auto" style={{ color: 'var(--text-tertiary)' }}>
            <MousePointerClick className="w-3 h-3" />{dicaClique}
          </span>
        )}
      </div>
      <div className="overflow-auto max-h-[600px] scrollbar-dark" style={{ borderTop: '1px solid var(--tint-06)' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>
              <th className="text-left px-4 py-2.5 sticky left-0 z-10 min-w-[170px]" style={{ background: 'var(--bg-card-subtle)' }}>
                <Cabeca por="nome" alinhar="left">{rotuloArea}</Cabeca>
              </th>
              {cands.map((c, i) => (
                <th key={c.id} className="text-right px-3 py-2.5 whitespace-nowrap" style={{ background: 'var(--bg-card-subtle)' }}>
                  <Cabeca por={i}><span className="w-2 h-2 rounded-full" style={{ background: c.cor }} />{c.nome}</Cabeca>
                </th>
              ))}
              <th className="text-left px-3 py-2.5 min-w-[130px] uppercase tracking-wider" style={{ background: 'var(--bg-card-subtle)' }}>Divisão</th>
              <th className="text-right px-4 py-2.5 whitespace-nowrap" style={{ background: 'var(--bg-card-subtle)' }}>
                <Cabeca por="dif">Vantagem</Cabeca>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={cands.length + 3} className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Nada encontrado com esse filtro.</td></tr>
            )}
            {visiveis.map(({ linha, r }) => {
              const corVenc = corDoResultado(r, cands.map(c => c.cor));
              return (
                <tr key={linha.chave}
                  onClick={onClickLinha ? () => onClickLinha(linha) : undefined}
                  className={`group ${onClickLinha ? 'cursor-pointer' : ''}`}
                  style={{ borderTop: '1px solid var(--tint-06)' }}>
                  <td className="px-4 py-2.5 sticky left-0 font-medium bg-[var(--bg-card)] group-hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-primary)', boxShadow: `inset 3px 0 0 ${corVenc}` }}>
                    <span className="block">{linha.nome}</span>
                    {linha.detalhe && <span className="block text-[10px] font-normal mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{linha.detalhe}</span>}
                  </td>
                  {linha.votos.map((v, i) => {
                    const venceu = r?.vencedor === i;
                    return (
                      <td key={i} className="px-3 py-2.5 text-right tabular-nums group-hover:bg-[var(--bg-hover)]">
                        <span className="block" style={{ color: venceu ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: venceu ? 700 : 400 }}>{fmt(v)}</span>
                        <span className="block text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{r ? pctBR(v / r.total) : '—'}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 group-hover:bg-[var(--bg-hover)]">
                    <BarraDividida altura={6} animar={false}
                      partes={cands.map((c, i) => ({ chave: c.id, valor: linha.votos[i], cor: c.cor }))} />
                  </td>
                  <td className="px-4 py-2.5 text-right group-hover:bg-[var(--bg-hover)]">
                    {!r ? <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      : r.vencedor === -1 ? <Etiqueta cor={COR_EMPATE}>empate</Etiqueta>
                      : (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <Etiqueta cor={corVenc}>+{pctBR(r.folga)}</Etiqueta>
                          <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{fmt(r.diferenca)} votos</span>
                        </span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}
