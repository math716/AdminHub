'use client';

// Comparador de candidatos do Mapa Eleitoral (fase 1).
//
// Escolhe-se de 2 a 4 candidatos do mesmo ano e turno; o mapa pinta cada
// estado (presidente) ou cidade com a cor de quem venceu ali ENTRE OS
// ESCOLHIDOS — mais forte quanto maior a vantagem. Ao lado, o resumo (votos e
// áreas vencidas) e a tabela completa por área.
//
// Sem dado novo: usa /api/tse/candidato, que já devolve os votos por estado,
// por cidade e por zona. Cidades de eleição municipal (prefeito, vereador)
// comparam por zona aqui; bairro e local de votação são a fase 2.

import { useMemo, useState } from 'react';
import { Plus, X, Loader2, Search, ArrowLeft, ArrowUpDown, AlertTriangle, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ESTADOS_BRASIL } from '@/lib/types';
import { campoDoPartido, coresDosCandidatos, NOME_CAMPO } from '@/lib/partidos-espectro';
import { MapaComparacao, cartaoTooltip, type AparenciaArea } from '@/components/mapa/mapa-comparacao';

const MAX_CANDIDATOS = 4;
const ANOS = ['2026', '2024', '2022', '2020', '2018'];
const ehAnoMunicipal = (ano: string) => (parseInt(ano, 10) - 2020) % 4 === 0;

interface DadosCandidato {
  candidatoId: string;
  candidateName: string;
  nomeUrna?: string;
  cargo: string;
  partido: string;
  situacao?: string;
  uf: string;
  totalVotos: number;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
}

interface Candidato {
  id: string;
  nome: string;
  partido: string;
  cargo: string;
  /** null = não tem votos neste turno (ex.: não foi ao 2º turno). */
  dados: DadosCandidato | null;
}

interface Homonimo {
  id: string;
  nome: string;
  nomeUrna: string;
  partido: string;
  cargo: string;
  totalVotos: number;
  municipioPrincipal?: string;
}

interface Linha {
  chave: string;
  nome: string;
  votos: number[];
}

interface Resultado {
  /** Índice do vencedor entre os candidatos ativos; -1 = empate. */
  vencedor: number;
  /** Diferença do 1º para o 2º, em votos. */
  diferenca: number;
  /** Diferença como fração dos votos dos escolhidos na área (0–1). */
  folga: number;
  total: number;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

function resultado(votos: number[]): Resultado | null {
  const total = votos.reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const ordem = votos.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const diferenca = ordem[0].v - (ordem[1]?.v ?? 0);
  return { vencedor: diferenca === 0 ? -1 : ordem[0].i, diferenca, folga: diferenca / total, total };
}

/** Vantagem pequena clareia a cor; grande deixa forte. */
function opacidadePorFolga(folga: number): number {
  if (folga < 0.05) return 0.35;
  if (folga < 0.15) return 0.6;
  return 0.85;
}

function cidadePrincipal(d: DadosCandidato): string | null {
  const porCidade: Record<string, number> = {};
  for (const z of d.zonas ?? []) porCidade[z.municipio] = (porCidade[z.municipio] ?? 0) + z.votos;
  const [cidade] = Object.entries(porCidade).sort((a, b) => b[1] - a[1])[0] ?? [];
  return cidade ?? null;
}

async function carregarCandidato(id: string, ano: string, uf: string, turno: number): Promise<DadosCandidato | null> {
  const params = new URLSearchParams({ candidatoId: id, ano, uf, turno: String(turno) });
  const res = await fetch(`/api/tse/candidato?${params}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d?.candidatoId ? d : null;
}

export function ComparadorCandidatos() {
  const [ano, setAno] = useState('2022');
  const [turno, setTurno] = useState<1 | 2>(1);
  const [abrangencia, setAbrangencia] = useState('BR');
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [homonimos, setHomonimos] = useState<Homonimo[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);

  // Presidente: clicar num estado abre as cidades dele.
  const [ufAberta, setUfAberta] = useState<string | null>(null);
  const [dadosUf, setDadosUf] = useState<Record<string, DadosCandidato | null>>({});
  const [carregandoUf, setCarregandoUf] = useState(false);

  const [ordem, setOrdem] = useState<{ por: 'nome' | 'dif' | number; desc: boolean }>({ por: 'dif', desc: false });

  const municipal = ehAnoMunicipal(ano);
  const escopo = municipal && abrangencia === 'BR' ? '' : abrangencia;

  const limpar = () => { setCandidatos([]); setHomonimos([]); setErro(''); setUfAberta(null); setDadosUf({}); };

  // ── Adicionar ────────────────────────────────────────────────────────────
  const adicionarPorId = async (id: string) => {
    setHomonimos([]);
    if (candidatos.some(c => c.id === id)) { setErro('Esse candidato já está na comparação.'); return; }
    if (candidatos.length >= MAX_CANDIDATOS) { setErro(`A comparação aceita até ${MAX_CANDIDATOS} candidatos.`); return; }
    setBuscando(true);
    try {
      const dados = await carregarCandidato(id, ano, escopo, turno);
      if (!dados) { setErro(turno === 2 ? 'Esse candidato não disputou o 2º turno.' : 'Não foi possível carregar esse candidato agora.'); return; }
      // Prefeito e vereador só se comparam com quem disputou a mesma cidade.
      const outroMunicipal = candidatos.find(c => c.dados && /PREFEITO|VEREADOR/i.test(c.cargo));
      if (/PREFEITO|VEREADOR/i.test(dados.cargo) && outroMunicipal?.dados) {
        const a = cidadePrincipal(dados), b = cidadePrincipal(outroMunicipal.dados);
        if (a && b && semAcento(a) !== semAcento(b)) {
          setErro(`${dados.nomeUrna ?? dados.candidateName} disputou em ${a}, e a comparação está em ${b}. Prefeitos e vereadores só se comparam dentro da mesma cidade.`);
          return;
        }
      }
      setErro('');
      setBusca('');
      setCandidatos(prev => [...prev, {
        id, nome: dados.nomeUrna || dados.candidateName, partido: dados.partido, cargo: dados.cargo, dados,
      }]);
      setUfAberta(null);
      setDadosUf({});
    } finally { setBuscando(false); }
  };

  const buscar = async () => {
    const nome = busca.trim();
    if (!nome) { setErro('Digite o nome do candidato.'); return; }
    if (!escopo) { setErro(`Em ${ano} a eleição foi municipal: escolha o estado da cidade.`); return; }
    if (candidatos.length >= MAX_CANDIDATOS) { setErro(`A comparação aceita até ${MAX_CANDIDATOS} candidatos.`); return; }
    setBuscando(true);
    setErro('');
    setHomonimos([]);
    try {
      const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: nome, ano, uf: escopo })}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(escopo === 'BR'
          ? 'Em "Brasil" só aparecem candidatos a presidente. Para outros cargos, escolha o estado.'
          : (d?.error ?? 'Candidato não encontrado.'));
        return;
      }
      if (d?.multiplos) { setHomonimos(d.candidatos ?? []); return; }
      if (d?.candidatoId) await adicionarPorId(d.candidatoId);
    } catch { setErro('Não foi possível buscar agora. Tente de novo.'); }
    finally { setBuscando(false); }
  };

  const remover = (id: string) => {
    setCandidatos(prev => prev.filter(c => c.id !== id));
    setUfAberta(null);
    setDadosUf({});
  };

  // Trocar o turno recarrega todos (o id é o mesmo nos dois turnos).
  const trocarTurno = async (t: 1 | 2) => {
    if (t === turno) return;
    setTurno(t);
    setUfAberta(null);
    setDadosUf({});
    if (candidatos.length === 0) return;
    setBuscando(true);
    const novos = await Promise.all(candidatos.map(async c => ({ ...c, dados: await carregarCandidato(c.id, ano, escopo, t) })));
    setCandidatos(novos);
    setBuscando(false);
  };

  const abrirUf = async (uf: string) => {
    setUfAberta(uf);
    setCarregandoUf(true);
    const pares = await Promise.all(ativos.map(async c => [c.id, await carregarCandidato(c.id, ano, uf, turno)] as const));
    setDadosUf(Object.fromEntries(pares));
    setCarregandoUf(false);
  };

  // ── Cores e candidatos ativos ────────────────────────────────────────────
  const cores = useMemo(() => coresDosCandidatos(candidatos.map(c => c.partido)), [candidatos]);
  const ativos = candidatos.filter(c => c.dados);
  const coresAtivas = candidatos.map((c, i) => (c.dados ? cores[i] : null)).filter((c): c is string => !!c);

  // ── Nível e linhas da comparação ─────────────────────────────────────────
  const ehMunicipal = ativos.some(c => /PREFEITO|VEREADOR/i.test(c.cargo));
  const nivel: 'brasil' | 'estado' | 'cidade' =
    ehMunicipal ? 'cidade' : escopo === 'BR' && !ufAberta ? 'brasil' : 'estado';
  const dadosNoNivel = (c: Candidato): DadosCandidato | null =>
    escopo === 'BR' && ufAberta ? dadosUf[c.id] ?? null : c.dados;

  const cidadeDaComparacao = ehMunicipal && ativos[0]?.dados ? cidadePrincipal(ativos[0].dados) : null;

  const linhas: Linha[] = useMemo(() => {
    if (ativos.length === 0) return [];
    if (nivel === 'brasil') {
      const ufs = new Set(ativos.flatMap(c => Object.keys(c.dados?.votosPorEstado ?? {})));
      return [...ufs].map(uf => ({
        chave: uf,
        // ZZ é como o TSE identifica os votos dados no exterior.
        nome: uf === 'ZZ' ? 'Exterior' : ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf,
        votos: ativos.map(c => c.dados?.votosPorEstado?.[uf] ?? 0),
      }));
    }
    if (nivel === 'cidade') {
      const alvo = cidadeDaComparacao ? semAcento(cidadeDaComparacao) : '';
      const porZona = ativos.map(c => {
        const m: Record<number, number> = {};
        for (const z of c.dados?.zonas ?? []) if (semAcento(z.municipio) === alvo) m[z.zona] = (m[z.zona] ?? 0) + z.votos;
        return m;
      });
      const zonas = new Set(porZona.flatMap(m => Object.keys(m).map(Number)));
      return [...zonas].map(z => ({ chave: String(z), nome: `Zona ${z}`, votos: porZona.map(m => m[z] ?? 0) }));
    }
    const porCidade = ativos.map(c => dadosNoNivel(c)?.votosPorNomeMunicipio ?? {});
    const cidades = new Set(porCidade.flatMap(m => Object.keys(m)));
    return [...cidades].map(nome => ({ chave: nome, nome, votos: porCidade.map(m => m[nome] ?? 0) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, nivel, ufAberta, dadosUf, cidadeDaComparacao]);

  const resultados = useMemo(() => linhas.map(l => ({ linha: l, r: resultado(l.votos) })), [linhas]);

  const resumo = useMemo(() => ativos.map((c, i) => ({
    votos: linhas.reduce((s, l) => s + l.votos[i], 0),
    vitorias: resultados.filter(x => x.r?.vencedor === i).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [linhas, resultados]);
  const areasComVoto = resultados.filter(x => x.r).length;
  const empates = resultados.filter(x => x.r?.vencedor === -1).length;
  const temExterior = nivel === 'brasil' && resultados.some(x => x.linha.chave === 'ZZ' && x.r);

  // Destaques: exemplos — a tabela abaixo traz todas as áreas.
  const disputadas = resultados.filter(x => x.r && x.linha.votos.filter(v => v > 0).length >= 2);
  const apertadas = [...disputadas].sort((a, b) => a.r!.folga - b.r!.folga).slice(0, 5);
  const folgadas = [...disputadas].sort((a, b) => b.r!.folga - a.r!.folga).slice(0, 5);

  const nomeArea = nivel === 'brasil' ? 'estados' : nivel === 'cidade' ? 'zonas' : 'cidades';
  const todasAsAreas = nivel === 'brasil' ? 'Todos os estados' : nivel === 'cidade' ? 'Todas as zonas' : 'Todas as cidades';

  // ── Mapa ─────────────────────────────────────────────────────────────────
  const htmlArea = (nome: string, votos: number[], r: Resultado): string => {
    const linhasHtml = ativos.map((c, i) => {
      const pct = r.total ? ((votos[i] / r.total) * 100).toFixed(1).replace('.', ',') : '0';
      const venceu = r.vencedor === i;
      return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;">
        <span style="width:9px;height:9px;border-radius:50%;background:${coresAtivas[i]};flex-shrink:0"></span>
        <span style="flex:1;color:var(--text-secondary);${venceu ? 'font-weight:700;color:var(--text-primary)' : ''}">${esc(c.nome)}</span>
        <span style="color:var(--text-primary);font-weight:600">${fmt(votos[i])}</span>
        <span style="color:var(--text-tertiary);font-size:11px;width:42px;text-align:right">${pct}%</span>
      </div>`;
    }).join('');
    const rodape = r.vencedor === -1
      ? 'Empate entre os mais votados'
      : `Vantagem: ${fmt(r.diferenca)} votos`;
    return cartaoTooltip(
      `<div style="font-weight:600;color:var(--acento-azul);font-size:13px;margin-bottom:4px">${esc(nome)}</div>${linhasHtml}` +
      `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">${rodape}</div>`,
    );
  };

  // Mapa do estado: a chave é o código IBGE (votosPorMunicipio).
  const porCodigo = useMemo(() => {
    if (nivel !== 'estado') return null;
    const listas = ativos.map(c => dadosNoNivel(c)?.votosPorMunicipio ?? {});
    return (codigo: string): number[] => listas.map(m => m[codigo] ?? m[codigo.slice(0, 6)] ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, nivel, ufAberta, dadosUf]);

  const aparencia = (chave: string, nome: string): AparenciaArea | null => {
    const votos = nivel === 'brasil'
      ? ativos.map(c => c.dados?.votosPorEstado?.[chave] ?? 0)
      : porCodigo?.(chave) ?? [];
    const r = resultado(votos);
    if (!r) return null;
    return {
      cor: r.vencedor === -1 ? '#64748b' : coresAtivas[r.vencedor],
      opacidade: r.vencedor === -1 ? 0.5 : opacidadePorFolga(r.folga),
      html: htmlArea(nome, votos, r),
    };
  };
  const versaoMapa = `${candidatos.map(c => `${c.id}:${c.dados ? 1 : 0}`).join(',')}|${turno}|${ufAberta}|${Object.keys(dadosUf).length}`;
  const ufDoMapa = nivel === 'estado' ? (ufAberta ?? escopo) : undefined;

  // ── Tabela ───────────────────────────────────────────────────────────────
  const linhasOrdenadas = useMemo(() => {
    const sinal = ordem.desc ? -1 : 1;
    return [...resultados].sort((a, b) => {
      if (ordem.por === 'nome') return sinal * a.linha.nome.localeCompare(b.linha.nome, 'pt-BR', { numeric: true });
      if (ordem.por === 'dif') return sinal * ((a.r?.folga ?? 2) - (b.r?.folga ?? 2));
      return sinal * (a.linha.votos[ordem.por] - b.linha.votos[ordem.por]);
    });
  }, [resultados, ordem]);
  const ordenarPor = (por: 'nome' | 'dif' | number) =>
    setOrdem(o => ({ por, desc: o.por === por ? !o.desc : por !== 'nome' && por !== 'dif' }));

  const opcoesAbrangencia = [
    ...(municipal ? [] : [{ value: 'BR', label: 'Brasil (presidente)' }]),
    ...ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome })),
  ];

  return (
    <div className="space-y-4">
      {/* ── Montar a comparação ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
            Comparar candidatos
          </CardTitle>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Até {MAX_CANDIDATOS} candidatos do mesmo ano e turno. As cores seguem o campo político do partido:
            esquerda em vermelho e laranja, direita em azul e verde, centro em amarelo e roxo.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-0.5">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Ano</label>
              <Select value={ano} onChange={(e) => { setAno(e.target.value); limpar(); if (ehAnoMunicipal(e.target.value) && abrangencia === 'BR') setAbrangencia('SP'); }}
                options={ANOS.map(a => ({ value: a, label: a }))} />
            </div>
            <div className="space-y-0.5">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Turno</label>
              <div className="flex rounded-lg p-0.5 text-xs h-9" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
                {([1, 2] as const).map(t => (
                  <button key={t} type="button" onClick={() => trocarTurno(t)}
                    className="flex-1 rounded-md font-medium transition-all"
                    style={turno === t ? { background: '#1a73e8', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                    {t}º turno
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-0.5 col-span-2">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Onde comparar</label>
              <Select value={escopo || abrangencia} onChange={(e) => { setAbrangencia(e.target.value); limpar(); }} options={opcoesAbrangencia} />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: '#4a7a9b' }} />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
                placeholder={candidatos.length >= MAX_CANDIDATOS ? 'Limite de 4 candidatos' : 'Nome do candidato'}
                disabled={candidatos.length >= MAX_CANDIDATOS}
                className="pl-8"
              />
            </div>
            <Button onClick={buscar} disabled={buscando || candidatos.length >= MAX_CANDIDATOS}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">Adicionar</span>
            </Button>
          </div>

          {erro && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--danger)' }}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {erro}
            </p>
          )}

          {homonimos.length > 0 && (
            <div className="rounded-lg p-2 space-y-1" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-subtle)' }}>
              <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>Encontramos mais de um. Escolha:</p>
              <div className="max-h-56 overflow-y-auto scrollbar-dark">
                {homonimos.map(h => (
                  <button key={h.id} type="button" onClick={() => adicionarPorId(h.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left hover:bg-[var(--tint-06)]">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{h.nomeUrna}</span>
                      <span className="block text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {h.partido} · {h.cargo}{h.municipioPrincipal ? ` · ${h.municipioPrincipal}` : ''}
                      </span>
                    </span>
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--acento-azul)' }}>{fmt(h.totalVotos)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {candidatos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {candidatos.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg pl-2 pr-1 py-1 max-w-full"
                  style={{ border: `1.5px solid ${cores[i]}`, background: 'var(--bg-card-subtle)', opacity: c.dados ? 1 : 0.55 }}>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cores[i] }} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                    <span className="block text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {c.partido} · {NOME_CAMPO[campoDoPartido(c.partido)]} · {c.cargo}
                      {!c.dados && ' · sem votos neste turno'}
                    </span>
                  </span>
                  <button type="button" onClick={() => remover(c.id)} className="p-1 rounded hover:bg-[var(--tint-08)]" aria-label={`Tirar ${c.nome} da comparação`}>
                    <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {ativos.length < 2 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {candidatos.length === 0
              ? 'Adicione pelo menos dois candidatos para ver onde cada um venceu.'
              : 'Adicione mais um candidato com votos neste turno para comparar.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Onde estamos ── */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ufAberta && (
              <Button variant="outline" size="sm" onClick={() => { setUfAberta(null); setDadosUf({}); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Brasil
              </Button>
            )}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {nivel === 'brasil' ? 'Brasil — por estado'
                : nivel === 'cidade' ? `${cidadeDaComparacao ?? 'Cidade'} — por zona eleitoral`
                : `${ESTADOS_BRASIL.find(e => e.sigla === ufDoMapa)?.nome ?? ufDoMapa} — por cidade`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {ano} · {turno}º turno{nivel === 'brasil' ? ' · clique num estado para ver as cidades' : ''}
            </span>
          </div>

          {/* Lado a lado só em tela larga: com o menu lateral do sistema, um notebook
              de 1024–1279px deixaria o resumo espremido — ali ele vai para baixo. */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* ── Mapa ── */}
            {nivel !== 'cidade' ? (
              <div className="xl:col-span-2 space-y-2">
                <div className="h-[340px] sm:h-[440px] xl:h-[520px] relative">
                  <MapaComparacao
                    tipo={nivel === 'brasil' ? 'brasil' : 'estado'}
                    uf={ufDoMapa}
                    aparencia={aparencia}
                    versao={versaoMapa}
                    altura="100%"
                    onClickArea={nivel === 'brasil' ? (uf) => abrirUf(uf) : undefined}
                  />
                  {carregandoUf && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(15,23,42,0.25)' }}>
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
                {/* Legenda */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {ativos.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: coresAtivas[i] }} />{c.nome}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span className="flex">
                      {[0.35, 0.6, 0.85].map(o => <span key={o} className="w-3 h-3" style={{ background: '#94a3b8', opacity: o }} />)}
                    </span>
                    vantagem pequena → grande
                  </span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#cbd5e1' }} />sem votos</span>
                </div>
              </div>
            ) : (
              <Card className="xl:col-span-2">
                <CardContent className="py-8 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                  Prefeito e vereador disputam uma cidade só: a comparação abaixo é por zona eleitoral.
                  O mapa por bairro e por local de votação chega na próxima etapa.
                </CardContent>
              </Card>
            )}

            {/* ── Resumo ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo</CardTitle>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {areasComVoto - (temExterior ? 1 : 0)} {nomeArea} com votos{temExterior ? ' + exterior' : ''}{empates ? ` · ${empates} empate${empates > 1 ? 's' : ''}` : ''}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {ativos.map((c, i) => {
                  const pctAreas = areasComVoto ? Math.round((resumo[i].vitorias / areasComVoto) * 100) : 0;
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: coresAtivas[i] }} />
                        <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.partido}</span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs pl-5">
                        <span style={{ color: 'var(--text-secondary)' }}>{fmt(resumo[i].votos)} votos</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          venceu em <strong style={{ color: 'var(--text-primary)' }}>{fmt(resumo[i].vitorias)}</strong> {nomeArea}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full ml-5" style={{ background: 'var(--tint-08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pctAreas}%`, background: coresAtivas[i] }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* ── Destaques ── */}
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
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: r!.vencedor === -1 ? '#64748b' : coresAtivas[r!.vencedor] }} />
                        <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{linha.nome}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {r!.vencedor === -1 ? 'empate' : `${ativos[r!.vencedor].nome} por ${fmt(r!.diferenca)}`}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── Tabela completa ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{todasAsAreas} ({fmt(linhas.length)})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[560px] scrollbar-dark">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-card)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <th className="text-left font-semibold px-3 py-2 sticky left-0 z-10 min-w-[140px]" style={{ background: 'var(--bg-card)' }}>
                        <button type="button" onClick={() => ordenarPor('nome')} className="flex items-center gap-1">
                          {nivel === 'brasil' ? 'Estado' : nivel === 'cidade' ? 'Zona' : 'Cidade'} <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </button>
                      </th>
                      {ativos.map((c, i) => (
                        <th key={c.id} className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                          <button type="button" onClick={() => ordenarPor(i)} className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: coresAtivas[i] }} />{c.nome}
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
                    {linhasOrdenadas.map(({ linha, r }) => (
                      <tr key={linha.chave} style={{ borderBottom: '1px solid var(--tint-06)' }}>
                        <td className="px-3 py-1.5 sticky left-0 font-medium" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: !r ? '#cbd5e1' : r.vencedor === -1 ? '#64748b' : coresAtivas[r.vencedor] }} />
                            {linha.nome}
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
      )}
    </div>
  );
}
