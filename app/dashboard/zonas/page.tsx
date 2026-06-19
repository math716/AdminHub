'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import {
  Layers,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  Vote,
  MapPin,
  Building2,
  User,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { ESTADOS_BRASIL } from '@/lib/types';

interface ZonaItem {
  municipio: string;
  zona: number;
  votos: number;
}

interface MunicipioAgrupado {
  municipio: string;
  totalVotos: number;
  zonas: ZonaItem[];
}

interface CandidatoInfo {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number | null;
  partido: string;
  cargo: string;
  situacao: string;
  totalVotos: number;
  uf: string;
  ano: number;
}

interface Resumo {
  totalVotos: number;
  totalZonas: number;
  totalMunicipios: number;
  uf: string;
  ano: number;
  municipioFiltro: string | null;
}

interface ApiResult {
  candidato: CandidatoInfo;
  resumo: Resumo;
  municipios: MunicipioAgrupado[];
  zonas: ZonaItem[];
}

export default function ZonasPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const canAccess = hasPermission({ role: userRole, permissions: userPermissions }, PERMISSIONS.MAPA_ELEITORAL);

  // Formulário de busca
  const [nome, setNome] = useState('');
  const [ano, setAno] = useState('2022');
  const [uf, setUf] = useState('');
  const [municipioFiltro, setMunicipioFiltro] = useState('');

  // Estado de busca
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ApiResult | null>(null);

  // Filtro/ordenação local
  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [filtroZona, setFiltroZona] = useState('');
  const [ordenar, setOrdenar] = useState<'votos' | 'municipio' | 'zona'>('votos');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.replace('/dashboard');
    }
  }, [status, canAccess, router]);

  const anoOptions = [
    { value: '2024', label: '2024 - Municipal' },
    { value: '2022', label: '2022 - Federal/Estadual' },
    { value: '2020', label: '2020 - Municipal' },
    { value: '2018', label: '2018 - Federal/Estadual' },
  ];

  const estadoOptions = [
    { value: '', label: 'Selecione um estado' },
    ...(ESTADOS_BRASIL?.map?.((e) => ({ value: e?.sigla ?? '', label: e?.nome ?? '' })) ?? []),
  ];

  const handleBuscar = async () => {
    if (!nome.trim()) { setError('Digite o nome do candidato'); return; }
    if (!uf) { setError('Selecione um estado'); return; }

    setLoading(true);
    setError('');
    setResultado(null);
    setFiltroMunicipio('');
    setFiltroZona('');
    setExpandidos(new Set());

    try {
      const params = new URLSearchParams({ nome, ano, uf, ordenar });
      if (municipioFiltro.trim()) params.set('municipio', municipioFiltro.trim());

      const res = await fetch(`/api/tse/zonas-lista?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Erro ao buscar dados');
        return;
      }

      setResultado(data);
    } catch {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  // Municípios filtrados e ordenados (filtro local)
  const municipiosFiltrados = useMemo(() => {
    if (!resultado) return [];
    let lista = resultado.municipios;

    if (filtroMunicipio.trim()) {
      const q = filtroMunicipio.trim().toUpperCase();
      lista = lista.filter(m => m.municipio.toUpperCase().includes(q));
    }

    if (filtroZona.trim()) {
      const zonaNum = parseInt(filtroZona);
      if (!isNaN(zonaNum)) {
        lista = lista.map(m => ({
          ...m,
          zonas: m.zonas.filter(z => z.zona === zonaNum),
        })).filter(m => m.zonas.length > 0);
      }
    }

    return [...lista].sort((a, b) => {
      if (ordenar === 'municipio') return a.municipio.localeCompare(b.municipio);
      return b.totalVotos - a.totalVotos;
    });
  }, [resultado, filtroMunicipio, filtroZona, ordenar]);

  const totalFiltrado = useMemo(
    () => municipiosFiltrados.reduce((s, m) => s + m.totalVotos, 0),
    [municipiosFiltrados]
  );

  const toggleExpand = (municipio: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(municipio)) next.delete(municipio);
      else next.add(municipio);
      return next;
    });
  };

  const expandirTodos = () => setExpandidos(new Set(municipiosFiltrados.map(m => m.municipio)));
  const recolherTodos = () => setExpandidos(new Set());

  const exportarCSV = () => {
    if (!resultado) return;
    const linhas = [
      ['Município', 'Zona', 'Votos'],
      ...resultado.zonas.map(z => [z.municipio, String(z.zona), String(z.votos)]),
    ];
    const csv = linhas.map(l => l.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zonas_${resultado.candidato.nomeUrna}_${resultado.candidato.uf}_${resultado.candidato.ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status === 'loading') {
    return <div className="text-center py-12 text-slate-600 dark:text-slate-400">Carregando...</div>;
  }

  if (!canAccess) return null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <PageHeader
        icon={Layers}
        title="Zonas Eleitorais"
        subtitle="Lista completa de zonas com votos por município"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar de busca */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5 text-[color:var(--brand-cobalt)]" />
                Buscar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Nome do Candidato"
                placeholder="Ex: João Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              />
              <Select
                label="Ano da Eleição"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                options={anoOptions}
              />
              <Select
                label="Estado (UF)"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                options={estadoOptions}
              />
              <Input
                label="Filtrar por Município (opcional)"
                placeholder="Ex: Campinas"
                value={municipioFiltro}
                onChange={(e) => setMunicipioFiltro(e.target.value)}
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button className="w-full" onClick={handleBuscar} loading={loading}>
                <Search className="h-4 w-4 mr-2" />
                Buscar Zonas
              </Button>
            </CardContent>
          </Card>

          {/* Resumo */}
          {resultado && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-blue-400" />
                  Candidato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[color:var(--text-primary)] font-semibold">{resultado.candidato.nomeUrna}</p>
                  <p className="text-slate-600 dark:text-slate-400 text-xs">{resultado.candidato.nome}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="info" className="text-xs">{resultado.candidato.partido}</Badge>
                    <Badge variant="default" className="text-xs">{resultado.candidato.cargo}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 pt-2 border-t border-[var(--border-default)]">
                  <div className="flex items-center gap-2">
                    <Vote className="h-4 w-4 text-[color:var(--brand-cobalt)]" />
                    <div>
                      <p className="text-[color:var(--brand-cobalt)] font-bold text-sm">
                        {resultado.resumo.totalVotos.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-slate-600 dark:text-slate-500 text-xs">votos totais</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-blue-400 font-bold text-sm">{resultado.resumo.totalZonas}</p>
                      <p className="text-slate-600 dark:text-slate-500 text-xs">zonas eleitorais</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-green-400" />
                    <div>
                      <p className="text-green-400 font-bold text-sm">{resultado.resumo.totalMunicipios}</p>
                      <p className="text-slate-600 dark:text-slate-500 text-xs">municípios</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Área principal */}
        <div className="lg:col-span-3 space-y-4">
          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400 mr-3" />
                <span className="text-slate-600 dark:text-slate-400">Carregando zonas eleitorais...</span>
              </CardContent>
            </Card>
          )}

          {!loading && !resultado && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <Layers className="h-16 w-16 text-slate-600 mb-4" />
                <p className="text-slate-600 dark:text-slate-400 text-lg font-medium">Busque um candidato</p>
                <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
                  Preencha o formulário ao lado para ver todas as zonas eleitorais com a quantidade de votos.
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && resultado && (
            <>
              {/* Barra de filtros e ações */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar município..."
                    value={filtroMunicipio}
                    onChange={(e) => setFiltroMunicipio(e.target.value)}
                    className="bg-[var(--bg-card-subtle)] border border-[var(--border-default)] text-[color:var(--text-primary)] text-sm rounded-lg px-3 py-1.5 flex-1 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Nº zona"
                    value={filtroZona}
                    onChange={(e) => setFiltroZona(e.target.value)}
                    className="bg-[var(--bg-card-subtle)] border border-[var(--border-default)] text-[color:var(--text-primary)] text-sm rounded-lg px-3 py-1.5 w-24 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOrdenar(ordenar === 'votos' ? 'municipio' : 'votos')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-card-subtle)] border border-[var(--border-default)] text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:border-blue-500 transition-colors"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    {ordenar === 'votos' ? 'Por votos' : 'Por município'}
                  </button>
                  <button
                    onClick={expandirTodos}
                    className="px-3 py-1.5 bg-[var(--bg-card-subtle)] border border-[var(--border-default)] text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:border-blue-500 transition-colors"
                  >
                    Expandir tudo
                  </button>
                  <button
                    onClick={recolherTodos}
                    className="px-3 py-1.5 bg-[var(--bg-card-subtle)] border border-[var(--border-default)] text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:border-blue-500 transition-colors"
                  >
                    Recolher
                  </button>
                  <button
                    onClick={exportarCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-[color:var(--text-primary)] text-sm rounded-lg transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                </div>
              </div>

              {/* Contador */}
              {(filtroMunicipio || filtroZona) && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    {municipiosFiltrados.length} município(s) encontrado(s) ·{' '}
                    <span className="text-[color:var(--brand-cobalt)] font-semibold">
                      {totalFiltrado.toLocaleString('pt-BR')} votos
                    </span>
                  </span>
                </div>
              )}

              {/* Lista de municípios com zonas */}
              <div className="space-y-2">
                {municipiosFiltrados.length === 0 && (
                  <Card>
                    <CardContent className="flex items-center justify-center py-10 text-slate-600 dark:text-slate-400">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Nenhum resultado encontrado com os filtros aplicados.
                    </CardContent>
                  </Card>
                )}

                {municipiosFiltrados.map((mun) => {
                  const expanded = expandidos.has(mun.municipio);
                  const pct = resultado.resumo.totalVotos > 0
                    ? ((mun.totalVotos / resultado.resumo.totalVotos) * 100).toFixed(1)
                    : '0.0';

                  return (
                    <div
                      key={mun.municipio}
                      className="bg-[var(--bg-card-subtle)]/60 border border-[var(--border-default)] rounded-xl overflow-hidden"
                    >
                      {/* Header do município */}
                      <button
                        onClick={() => toggleExpand(mun.municipio)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card-subtle)]/40 transition-colors text-left"
                      >
                        {expanded
                          ? <ChevronDown className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                        }

                        <MapPin className="h-4 w-4 text-blue-400 flex-shrink-0" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[color:var(--text-primary)] font-semibold truncate">
                              {mun.municipio}
                            </span>
                            <span className="text-slate-600 dark:text-slate-500 text-xs flex-shrink-0">
                              {mun.zonas.length} zona{mun.zonas.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {/* Barra de progresso */}
                          <div className="mt-1 h-1 bg-[var(--bg-card-subtle)] rounded-full w-full max-w-[200px]">
                            <div
                              className="h-1 bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-[color:var(--brand-cobalt)] font-bold text-sm">
                            {mun.totalVotos.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-slate-600 dark:text-slate-500 text-xs">{pct}%</p>
                        </div>
                      </button>

                      {/* Zonas expandidas */}
                      {expanded && (
                        <div className="border-t border-[var(--border-default)] px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {mun.zonas.map((zona) => {
                              const pctZona = mun.totalVotos > 0
                                ? ((zona.votos / mun.totalVotos) * 100).toFixed(1)
                                : '0.0';
                              return (
                                <div
                                  key={zona.zona}
                                  className="flex items-center gap-2 p-2 bg-[var(--bg-card-subtle)]/50 rounded-lg border border-[var(--border-default)] hover:border-[var(--brand-cobalt)] transition-colors"
                                >
                                  <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center text-[color:var(--text-primary)] text-xs font-bold flex-shrink-0">
                                    {zona.zona}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-green-400 font-bold text-sm leading-tight">
                                      {zona.votos.toLocaleString('pt-BR')}
                                    </p>
                                    <p className="text-slate-600 dark:text-slate-500 text-[10px]">{pctZona}% do mun.</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tabela plana completa (toggle) */}
              <div>
                <button
                  onClick={() => setVerTodos(!verTodos)}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-white transition-colors"
                >
                  {verTodos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {verTodos ? 'Ocultar' : 'Ver'} tabela completa ({resultado.zonas.length} linhas)
                </button>

                {verTodos && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-default)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--bg-card-subtle)] text-slate-600 dark:text-slate-400 text-left">
                          <th className="px-4 py-2.5 font-medium">#</th>
                          <th className="px-4 py-2.5 font-medium">Município</th>
                          <th className="px-4 py-2.5 font-medium">Zona</th>
                          <th className="px-4 py-2.5 font-medium text-right">Votos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {resultado.zonas.map((z, i) => (
                          <tr
                            key={`${z.municipio}-${z.zona}`}
                            className="hover:bg-[var(--bg-card-subtle)]/60 transition-colors"
                          >
                            <td className="px-4 py-2 text-slate-600 dark:text-slate-500">{i + 1}</td>
                            <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{z.municipio}</td>
                            <td className="px-4 py-2">
                              <span className="bg-blue-900/50 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-700/50">
                                {z.zona}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-[color:var(--brand-cobalt)] font-semibold">
                              {z.votos.toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[var(--bg-card-subtle)] border-t border-[var(--border-default)]">
                          <td colSpan={3} className="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-right">
                            Total
                          </td>
                          <td className="px-4 py-2.5 text-right text-[color:var(--brand-cobalt)] font-bold">
                            {resultado.resumo.totalVotos.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
