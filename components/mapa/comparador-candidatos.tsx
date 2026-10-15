'use client';

// Comparador de candidatos do Mapa Eleitoral.
//
// Escolhe-se de 2 a 4 candidatos do mesmo ano e turno; o mapa pinta cada
// estado (presidente) ou cidade com a cor de quem venceu ali ENTRE OS
// ESCOLHIDOS — mais forte quanto maior a vantagem. Ao lado, o resumo (votos e
// áreas vencidas) e a tabela completa por área.
//
// Brasil → estado → cidade: clicar num estado (presidente) abre as cidades;
// clicar numa cidade abre a comparação dentro dela — por local de votação,
// bairro e zona (comparacao-cidade). Prefeito e vereador abrem direto na
// cidade. Os votos por estado/cidade vêm de /api/tse/candidato.

import { useMemo, useState } from 'react';
import { Plus, X, Loader2, Search, ArrowLeft, AlertTriangle, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ESTADOS_BRASIL } from '@/lib/types';
import { campoDoPartido, coresDosCandidatos, NOME_CAMPO } from '@/lib/partidos-espectro';
import { MapaComparacao, type AparenciaArea } from '@/components/mapa/mapa-comparacao';
import {
  type CandidatoNaComparacao, type Linha, DetalhesComparacao, LegendaComparacao, ResumoComparacao,
  corDoResultado, fmt, htmlComparacao, opacidadePorFolga, resultado, semAcento,
} from '@/components/mapa/comparacao-comum';
import { ComparacaoCidade } from '@/components/mapa/comparacao-cidade';
import { BotaoPdfComparacao } from '@/components/mapa/pdf-comparacao';

const MAX_CANDIDATOS = 4;
const ANOS = ['2026', '2024', '2022', '2020', '2018'];
const ehAnoMunicipal = (ano: string) => (parseInt(ano, 10) - 2020) % 4 === 0;
const nomeDaUf = (uf: string) => ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf;

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
  // Cidade aberta a partir do mapa ou da tabela do estado.
  const [cidadeAberta, setCidadeAberta] = useState<string | null>(null);

  const municipal = ehAnoMunicipal(ano);
  const escopo = municipal && abrangencia === 'BR' ? '' : abrangencia;

  const voltarAoInicio = () => { setUfAberta(null); setDadosUf({}); setCidadeAberta(null); };
  const limpar = () => { setCandidatos([]); setHomonimos([]); setErro(''); voltarAoInicio(); };

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
      voltarAoInicio();
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
    voltarAoInicio();
  };

  // Trocar o turno recarrega todos (o id é o mesmo nos dois turnos) e mantém
  // a cidade aberta, se houver.
  const trocarTurno = async (t: 1 | 2) => {
    if (t === turno) return;
    setTurno(t);
    if (candidatos.length === 0) return;
    setBuscando(true);
    const novos = await Promise.all(candidatos.map(async c => ({ ...c, dados: await carregarCandidato(c.id, ano, escopo, t) })));
    setCandidatos(novos);
    if (ufAberta) {
      const pares = await Promise.all(novos.filter(c => c.dados).map(async c => [c.id, await carregarCandidato(c.id, ano, ufAberta, t)] as const));
      setDadosUf(Object.fromEntries(pares));
    }
    setBuscando(false);
  };

  const abrirUf = async (uf: string) => {
    setUfAberta(uf);
    setCidadeAberta(null);
    setCarregandoUf(true);
    const pares = await Promise.all(ativos.map(async c => [c.id, await carregarCandidato(c.id, ano, uf, turno)] as const));
    setDadosUf(Object.fromEntries(pares));
    setCarregandoUf(false);
  };

  // ── Cores e candidatos ativos ────────────────────────────────────────────
  const cores = useMemo(() => coresDosCandidatos(candidatos.map(c => c.partido)), [candidatos]);
  const ativos = candidatos.filter(c => c.dados);
  const coresAtivas = candidatos.map((c, i) => (c.dados ? cores[i] : null)).filter((c): c is string => !!c);
  const candsAtivos: CandidatoNaComparacao[] = ativos.map((c, i) => ({ id: c.id, nome: c.nome, partido: c.partido, cor: coresAtivas[i] }));

  // ── Nível ────────────────────────────────────────────────────────────────
  const ehMunicipal = ativos.some(c => /PREFEITO|VEREADOR/i.test(c.cargo));
  const dadosNoNivel = (c: Candidato): DadosCandidato | null =>
    escopo === 'BR' && ufAberta ? dadosUf[c.id] ?? null : c.dados;
  const cidadeDaComparacao = ehMunicipal && ativos[0]?.dados ? cidadePrincipal(ativos[0].dados) : null;
  const cidadeAtual = ehMunicipal ? cidadeDaComparacao : cidadeAberta;
  const nivel: 'brasil' | 'estado' | 'cidade' =
    cidadeAtual ? 'cidade' : escopo === 'BR' && !ufAberta ? 'brasil' : 'estado';
  const ufAtual = ufAberta ?? escopo;

  // ── Linhas (Brasil e estado; a cidade calcula as suas) ─────────────────────
  const linhas: Linha[] = useMemo(() => {
    if (ativos.length === 0 || nivel === 'cidade') return [];
    if (nivel === 'brasil') {
      const ufs = new Set(ativos.flatMap(c => Object.keys(c.dados?.votosPorEstado ?? {})));
      return [...ufs].map(uf => ({
        chave: uf,
        // ZZ é como o TSE identifica os votos dados no exterior.
        nome: uf === 'ZZ' ? 'Exterior' : nomeDaUf(uf),
        votos: ativos.map(c => c.dados?.votosPorEstado?.[uf] ?? 0),
      }));
    }
    const porCidade = ativos.map(c => dadosNoNivel(c)?.votosPorNomeMunicipio ?? {});
    const cidades = new Set(porCidade.flatMap(m => Object.keys(m)));
    return [...cidades].map(nome => ({ chave: nome, nome, votos: porCidade.map(m => m[nome] ?? 0) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, nivel, ufAberta, dadosUf]);

  const temExterior = nivel === 'brasil' && linhas.some(l => l.chave === 'ZZ' && l.votos.some(v => v > 0));

  // ── Mapa (Brasil e estado) ───────────────────────────────────────────────
  // No estado, a chave do mapa é o código IBGE (votosPorMunicipio).
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
      cor: corDoResultado(r, coresAtivas),
      opacidade: r.vencedor === -1 ? 0.5 : opacidadePorFolga(r.folga),
      html: htmlComparacao(nome, nivel === 'estado' ? 'Clique para ver dentro da cidade' : null, candsAtivos, votos, r),
    };
  };
  const versaoMapa = `${candidatos.map(c => `${c.id}:${c.dados ? 1 : 0}`).join(',')}|${turno}|${ufAberta}|${Object.keys(dadosUf).length}`;

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
            {nivel === 'cidade' && !ehMunicipal && (
              <Button variant="outline" size="sm" onClick={() => setCidadeAberta(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> {nomeDaUf(ufAtual)}
              </Button>
            )}
            {nivel === 'estado' && ufAberta && (
              <Button variant="outline" size="sm" onClick={voltarAoInicio}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Brasil
              </Button>
            )}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {nivel === 'brasil' ? 'Brasil — por estado'
                : nivel === 'cidade' ? `${cidadeAtual} (${ufAtual})`
                : `${nomeDaUf(ufAtual)} — por cidade`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {ano} · {turno}º turno
              {nivel === 'brasil' ? ' · clique num estado para ver as cidades' : ''}
              {nivel === 'estado' ? ' · clique numa cidade para ver por local de votação, bairro e zona' : ''}
            </span>
            {nivel !== 'cidade' && (
              <BotaoPdfComparacao
                tipo="comparacao"
                titulo={`${candsAtivos.map(c => c.nome).join(' × ')} — ${ano}`}
                subtitulo={`${nivel === 'brasil' ? 'Brasil — por estado' : `${nomeDaUf(ufAtual)} — por cidade`} · ${turno}º turno`}
                colunas={candsAtivos.map(c => c.nome)}
                cores={candsAtivos.map(c => c.cor)}
                rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                linhas={linhas.map(l => ({ nome: l.nome, valores: l.votos }))}
                mapa={{ tipo: nivel === 'brasil' ? 'brasil' : 'estado', uf: nivel === 'estado' ? ufAtual : undefined }}
                // Chave: sigla da UF (Brasil) ou nome da cidade (estado).
                coresMapa={Object.fromEntries(linhas.flatMap(l => {
                  const r = resultado(l.votos);
                  if (!r) return [];
                  return [[nivel === 'brasil' ? l.chave : l.nome, {
                    cor: corDoResultado(r, coresAtivas), opacidade: r.vencedor === -1 ? 0.5 : opacidadePorFolga(r.folga),
                  }] as const];
                }))}
              />
            )}
          </div>

          {nivel === 'cidade' ? (
            <ComparacaoCidade
              uf={ufAtual}
              municipio={cidadeAtual!}
              ano={ano}
              turno={turno}
              cands={ativos.map((c, i) => ({ ...candsAtivos[i], zonas: dadosNoNivel(c)?.zonas ?? [] }))}
            />
          ) : (
            <>
              {/* Lado a lado só em tela larga: com o menu lateral do sistema, um notebook
                  de 1024–1279px deixaria o resumo espremido — ali ele vai para baixo. */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 space-y-2">
                  <div className="h-[340px] sm:h-[440px] xl:h-[520px] relative">
                    <MapaComparacao
                      tipo={nivel === 'brasil' ? 'brasil' : 'estado'}
                      uf={nivel === 'estado' ? ufAtual : undefined}
                      aparencia={aparencia}
                      versao={versaoMapa}
                      altura="100%"
                      onClickArea={nivel === 'brasil' ? (uf) => abrirUf(uf) : (_codigo, nome) => setCidadeAberta(nome)}
                    />
                    {carregandoUf && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(15,23,42,0.25)' }}>
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <LegendaComparacao cands={candsAtivos} />
                </div>
                <ResumoComparacao
                  cands={candsAtivos}
                  linhas={linhas}
                  nomeArea={nivel === 'brasil' ? 'estados' : 'cidades'}
                  extra={temExterior ? { descontar: 1, texto: ' + exterior' } : undefined}
                />
              </div>
              <DetalhesComparacao
                cands={candsAtivos}
                linhas={linhas}
                rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                todasAsAreas={nivel === 'brasil' ? 'Todos os estados' : 'Todas as cidades'}
                onClickLinha={nivel === 'brasil'
                  ? (l) => { if (l.chave !== 'ZZ') abrirUf(l.chave); }
                  : (l) => setCidadeAberta(l.nome)}
                dicaClique={nivel === 'brasil' ? 'Clique num estado para ver as cidades.' : 'Clique numa cidade para ver por local de votação, bairro e zona.'}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
