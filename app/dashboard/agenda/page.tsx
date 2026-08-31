'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { GoogleConexao } from '@/components/agenda/google-conexao';
import { ImportarPdf } from '@/components/agenda/importar-pdf';
import { createPortal } from 'react-dom';
import { Select } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X,
  Loader2, CheckCircle, AlertTriangle, MapPin, Navigation, Clock,
  Users, Mic, Briefcase, TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DatePicker, TimePicker, ColorPicker } from '@/components/ui/date-time-picker';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface AgendaEvent {
  id: string;
  titulo: string;
  descricao?: string;
  data: string;
  dataFim?: string;
  local?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  tipo: string;
  cor?: string;
  createdBy?: { name: string };
}

// ---------------------------------------------------------------------------
// Feriados nacionais brasileiros (fixos + variáveis aproximados)
// ---------------------------------------------------------------------------
function getFeriados(ano: number): Record<string, string> {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(ano, month - 1, day);

  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    '01-01': 'Confraternização Universal',
    '04-21': 'Tiradentes',
    '05-01': 'Dia do Trabalho',
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '11-20': 'Consciência Negra',
    '12-25': 'Natal',
    [fmt(addDays(pascoa, -48))]: 'Segunda de Carnaval',
    [fmt(addDays(pascoa, -47))]: 'Terça de Carnaval',
    [fmt(addDays(pascoa, -2))]:  'Sexta-feira Santa',
    [fmt(pascoa)]:               'Páscoa',
    [fmt(addDays(pascoa, 60))]:  'Corpus Christi',
  };
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const TIPO_LABELS: Record<string, string> = {
  REUNIAO: 'Reunião', VISITA: 'Visita', EVENTO: 'Evento', COMPROMISSO: 'Compromisso',
};
const TIPO_COLORS: Record<string, string> = {
  REUNIAO: '#2563EB', VISITA: '#22c55e', EVENTO: '#818cf8', COMPROMISSO: '#fb923c',
};
/** Mesma identidade, mas na luminosidade certa de cada tema — ver globals.css. */
const TIPO_TEXTO: Record<string, string> = {
  REUNIAO: 'var(--tipo-reuniao-texto)', VISITA: 'var(--tipo-visita-texto)',
  EVENTO: 'var(--tipo-evento-texto)',   COMPROMISSO: 'var(--tipo-compromisso-texto)',
};
const EMPTY_FORM = {
  titulo: '', descricao: '', data: '', dataFim: '', hora: '09:00', horaFim: '',
  local: '', endereco: '', tipo: 'REUNIAO', cor: '',
  lat: null as number | null, lng: null as number | null,
};

// ---------------------------------------------------------------------------
// Ícone por tipo de evento
// ---------------------------------------------------------------------------
function TipoIcon({ tipo, size = 16 }: { tipo: string; size?: number }) {
  const color = TIPO_COLORS[tipo] ?? '#2563EB';
  const s = { width: size, height: size, color, flexShrink: 0 };
  if (tipo === 'REUNIAO')     return <Users style={s} />;
  if (tipo === 'VISITA')      return <MapPin style={s} />;
  if (tipo === 'EVENTO')      return <Mic style={s} />;
  if (tipo === 'COMPROMISSO') return <Briefcase style={s} />;
  return <CalendarDays style={s} />;
}

function TipoIconBox({ tipo, box = 32, icon = 16 }: { tipo: string; box?: number; icon?: number }) {
  const color = TIPO_COLORS[tipo] ?? '#2563EB';
  return (
    <span
      className="flex items-center justify-center flex-shrink-0 rounded-xl"
      style={{ width: box, height: box, background: color + '20', border: `1px solid ${color}40` }}
    >
      <TipoIcon tipo={tipo} size={icon} />
    </span>
  );
}

/** Uma linha de compromisso. Mesma peça no bloco do dia e no "A seguir". */
function LinhaEvento({ e, onClick, destaque, comData }: {
  e: AgendaEvent; onClick: () => void; destaque?: boolean; comData?: boolean;
}) {
  const hora = new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = new Date(e.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <button onClick={onClick}
      className="w-full text-left px-4 py-3 transition-all hover:bg-[var(--tint-06)] flex items-start gap-3">
      {/* A hora à esquerda alinhada dá a leitura vertical do dia. */}
      <span className="text-xs font-semibold tabular-nums pt-0.5 flex-shrink-0"
        style={{ color: TIPO_TEXTO[e.tipo] ?? 'var(--brand-cobalt-text)', minWidth: 38 }}>
        {hora}
      </span>
      <span className="w-px self-stretch flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${TIPO_COLORS[e.tipo] ?? '#2563EB'} 45%, transparent)` }} />
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-[color:var(--text-primary)] ${destaque ? 'text-sm font-medium' : 'text-[13px]'}`}>
          {e.titulo}
        </span>
        <span className="flex items-center gap-2.5 mt-0.5 text-xs" style={{ color: 'var(--tint-45)' }}>
          {comData && <span className="capitalize">{dia.replace('.', '')}</span>}
          {e.local && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />{e.local}
            </span>
          )}
          {!comData && !e.local && <span>{TIPO_LABELS[e.tipo]}</span>}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function AgendaPage() {
  const { status } = useSession();
  const router = useRouter();

  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<AgendaEvent | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  const [geoLoading, setGeoLoading] = useState(false);
  // Nome do lugar encontrado. Coordenada sozinha nao diz nada a quem le:
  // "Prefeitura de Sao Paulo" resolveu para Sao Jose do Rio Preto e o erro
  // so aparecia depois, no mapa.
  const [geoNome, setGeoNome] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchEvents();
  }, [status, viewMonth, viewYear]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?mes=${viewMonth + 1}&ano=${viewYear}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const feriados = getFeriados(viewYear);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<number, AgendaEvent[]>();
  events.forEach((e) => {
    const d = new Date(e.data);
    if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
      const day = d.getDate();
      if (!eventsByDay.has(day)) eventsByDay.set(day, []);
      eventsByDay.get(day)!.push(e);
    }
  });

  const statsByTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => { counts[e.tipo] = (counts[e.tipo] ?? 0) + 1; });
    return counts;
  }, [events]);

  const isCurrentMonth = viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const todayEvents = isCurrentMonth ? (eventsByDay.get(today.getDate()) ?? []) : [];

  const openNewOnDay = (day: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    setEditEvent(null);
    setForm({ ...EMPTY_FORM, data: dateStr });
    setGeoNome('');
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (e: AgendaEvent) => {
    const d = new Date(e.data);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditEvent(e);
    // Sem isto, o lugar geocodificado do evento anterior ficaria na tela ao
    // abrir outro — dizendo que o endereco deste foi confirmado quando nao foi.
    setGeoNome('');
    setForm({
      titulo: e.titulo,
      descricao: e.descricao ?? '',
      data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      dataFim: e.dataFim ? new Date(e.dataFim).toISOString().split('T')[0] : '',
      horaFim: e.dataFim ? `${pad(new Date(e.dataFim).getHours())}:${pad(new Date(e.dataFim).getMinutes())}` : '',
      local: e.local ?? '',
      endereco: e.endereco ?? '',
      tipo: e.tipo,
      cor: e.cor ?? '',
      lat: e.lat ?? null,
      lng: e.lng ?? null,
    });
    setFormError('');
    setShowModal(true);
  };

  const geocodeFormAddress = useCallback(async () => {
    const addr = form.endereco || form.local;
    if (!addr.trim()) return;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0];
        setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, endereco: f.endereco || r.endereco }));
        setGeoNome(r.displayName || r.endereco || '');
      } else {
        setGeoNome('');
      }
    } finally {
      setGeoLoading(false);
    }
  }, [form.endereco, form.local]);

  const handleSave = async () => {
    if (!form.titulo || !form.data) { setFormError('Preencha título e data.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const [y, mo, d] = form.data.split('-').map(Number);
      const [hh, mm] = (form.hora || '00:00').split(':').map(Number);
      const dataISO = new Date(y, mo - 1, d, hh, mm).toISOString();
      let dataFimISO: string | undefined;
      if (form.dataFim) {
        const [fy, fm, fd] = form.dataFim.split('-').map(Number);
        const [fhh, fmm] = (form.horaFim || '00:00').split(':').map(Number);
        dataFimISO = new Date(fy, fm - 1, fd, fhh, fmm).toISOString();
      }
      const payload = {
        titulo: form.titulo,
        descricao: form.descricao || null,
        data: dataISO,
        dataFim: dataFimISO ?? null,
        local: form.local || null,
        endereco: form.endereco || null,
        lat: form.lat,
        lng: form.lng,
        tipo: form.tipo,
        cor: form.cor || TIPO_COLORS[form.tipo] || null,
      };
      const url = editEvent ? `/api/agenda/${editEvent.id}` : '/api/agenda';
      const method = editEvent ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro');
      setShowModal(false);
      setEditEvent(null);
      await fetchEvents();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editEvent) return;
    setDeleting(true);
    try {
      await fetch(`/api/agenda/${editEvent.id}`, { method: 'DELETE' });
      setShowModal(false);
      setEditEvent(null);
      await fetchEvents();
    } finally {
      setDeleting(false);
    }
  };

  const dayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];
  const isToday = (day: number) => day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const fmtKey = (day: number) => `${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const goToday = () => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); };
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  /** Janela do dia: do primeiro ao último compromisso. Diz mais que a contagem. */
  const janelaDoDia = (evs: AgendaEvent[]): string | null => {
    if (evs.length === 0) return null;
    const hs = evs.map(e => new Date(e.data)).sort((a, b) => a.getTime() - b.getTime());
    const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return hs.length === 1 ? fmt(hs[0]) : `${fmt(hs[0])} – ${fmt(hs[hs.length - 1])}`;
  };

  /** Compromissos dos próximos 7 dias — o horizonte real de quem organiza. */
  const daSemana = useMemo(() => {
    const ini = new Date(today); ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini); fim.setDate(fim.getDate() + 7);
    return events.filter(e => { const d = new Date(e.data); return d >= ini && d < fim; });
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Compromissos do dia em foco: o selecionado, ou hoje. */
  const emFoco = selectedDay ? dayEvents : todayEvents;

  /**
   * O que vem DEPOIS do dia em foco.
   *
   * A lista antiga começava em "agora" e repetia, logo abaixo, os mesmos
   * compromissos que o bloco do dia já mostrava — com poucos eventos no mês,
   * a coluna inteira era a mesma informação duas vezes.
   */
  const aSeguir = useMemo(() => {
    const base = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : new Date(today);
    base.setHours(23, 59, 59, 999);          // tudo depois do fim do dia em foco
    return events
      .filter(e => new Date(e.data) > base)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .slice(0, 8);
  }, [events, selectedDay, viewMonth, viewYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = "mt-1 w-full rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] text-sm outline-none transition-all"
    + " placeholder-[color:var(--text-tertiary)]"
    + " focus:border-[#2563EB]/60";

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, var(--bg-page) 0%, var(--bg-card) 50%, var(--bg-card) 100%)' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--brand-cobalt)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[color:var(--text-primary)]">
      <PageHeader
        icon={CalendarDays}
        title="Agenda do Gabinete"
        subtitle={`${events.length} evento${events.length !== 1 ? 's' : ''} em ${MESES[viewMonth]}`}
        actions={
          <div className="flex items-center gap-2">
            <ImportarPdf onImportou={fetchEvents} />
            <button
              onClick={() => { setEditEvent(null); setForm({ ...EMPTY_FORM }); setFormError(''); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF' }}
            >
              <Plus className="w-4 h-4" />
              Novo Evento
            </button>
          </div>
        }
      />

      {/* ── Conexão com o Google Agenda ── */}
      <Suspense fallback={null}>
        <GoogleConexao onSincronizou={fetchEvents} />
      </Suspense>

      {/* ── Resumo ──
          Antes eram quatro cartões grandes com "3, 0, 0, 0": muito espaço para
          pouca informação, e três deles quase sempre em zero. Aqui ficam os
          recortes que quem organiza a agenda realmente usa — hoje, os próximos
          sete dias e o mês — com a composição por tipo como detalhe, não como
          manchete. */}
      <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none" style={{ color: 'var(--brand-cobalt-text)' }}>
            {todayEvents.length}
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-[color:var(--text-primary)]">
              {todayEvents.length === 1 ? 'compromisso hoje' : 'compromissos hoje'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--tint-45)' }}>
              {janelaDoDia(todayEvents) ?? 'nada marcado'}
            </p>
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: 'var(--tint-08)' }} />

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none text-[color:var(--text-primary)]">
            {daSemana.length}
          </span>
          <p className="text-xs leading-tight" style={{ color: 'var(--tint-45)' }}>
            nos próximos<br />7 dias
          </p>
        </div>

        <div className="h-8 w-px hidden sm:block" style={{ background: 'var(--tint-08)' }} />

        {/* Só os tipos que existem no mês: chip zerado não informa nada. */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {Object.entries(TIPO_LABELS)
            .filter(([tipo]) => (statsByTipo[tipo] ?? 0) > 0)
            .map(([tipo, label]) => (
              <span key={tipo} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                style={{
                  // color-mix mantém o mesmo peso visual sobre branco e sobre
                  // navy; um alpha fixo some no fundo escuro.
                  background: `color-mix(in srgb, ${TIPO_COLORS[tipo] ?? '#2563EB'} 16%, transparent)`,
                  color: TIPO_TEXTO[tipo] ?? 'var(--brand-cobalt-text)',
                }}>
                <TipoIcon tipo={tipo} size={12} />
                <strong className="font-semibold">{statsByTipo[tipo]}</strong>
                <span style={{ opacity: 0.85 }}>{label.toLowerCase()}</span>
              </span>
            ))}
          {events.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--tint-35)' }}>
              Nenhum compromisso em {MESES[viewMonth]}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Calendário ── */}
        <div
          className="lg:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.15)', backdropFilter: 'blur(8px)' }}
        >
          {/* Navegação do mês */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--tint-06)' }}>
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-[var(--tint-10)]"
              style={{ color: 'var(--tint-55)' }}>
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-[color:var(--text-primary)] font-bold text-lg tracking-wide">
                {MESES[viewMonth]}{' '}
                <span style={{ color: 'var(--brand-cobalt-text)' }}>{viewYear}</span>
              </h2>
              {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
                <button
                  onClick={goToday}
                  className="text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-80"
                  style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}
                >
                  Hoje
                </button>
              )}
            </div>

            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-[var(--tint-10)]"
              style={{ color: 'var(--tint-55)' }}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--tint-06)' }}>
            {DIAS_SEMANA.map((d, i) => (
              <div key={d} className="text-center py-2.5 text-xs font-semibold uppercase tracking-widest"
                style={{ color: i === 0 || i === 6 ? 'rgba(37,99,235,0.6)' : 'var(--tint-35)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Células do calendário */}
          {loading ? (
            <div className="flex items-center justify-center h-48 md:h-64">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--brand-cobalt)' }} />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) return (
                  <div key={`empty-${idx}`} className="h-14 md:h-[4.75rem]"
                    style={{ borderBottom: '1px solid var(--tint-04)', borderRight: '1px solid var(--tint-04)' }} />
                );
                const dayEvs = eventsByDay.get(day) ?? [];
                const feriado = feriados[fmtKey(day)];
                const isTod = isToday(day);
                const isSel = selectedDay === day;
                const isWeekend = (() => {
                  const dow = new Date(viewYear, viewMonth, day).getDay();
                  return dow === 0 || dow === 6;
                })();

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(isSel ? null : day)}
                    className="h-14 md:h-[4.75rem] p-1 md:p-1.5 cursor-pointer transition-all group"
                    style={{
                      borderBottom: '1px solid var(--tint-04)',
                      borderRight: '1px solid var(--tint-04)',
                      background: isSel
                        ? 'rgba(37,99,235,0.08)'
                        : isWeekend ? 'rgba(255,255,255,0.012)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--tint-04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSel ? 'rgba(37,99,235,0.08)' : isWeekend ? 'rgba(255,255,255,0.012)' : 'transparent'; }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                        style={isTod
                          ? { background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF', fontWeight: 800 }
                          : feriado
                            ? { color: 'var(--danger)' }
                            : isWeekend
                              ? { color: 'rgba(37,99,235,0.5)' }
                              : { color: 'var(--tint-75)' }
                        }
                      >
                        {day}
                      </span>
                      {/* Com pouco espaço, os compromissos que não couberem
                          viram pontos na cor do tipo — a densidade do dia
                          continua legível sem texto. */}
                      {dayEvs.length > 0 && (
                        <span className="flex gap-0.5 mt-1.5 mr-0.5">
                          {dayEvs.slice(0, 4).map(e => (
                            <span key={e.id} className="w-1 h-1 rounded-full"
                              style={{ background: e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB' }} />
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {feriado && (
                        <div className="text-[9px] truncate leading-tight" style={{ color: 'rgba(248,113,113,0.6)' }}>{feriado}</div>
                      )}
                      {dayEvs.slice(0, feriado ? 1 : 2).map((e) => (
                        <div
                          key={e.id}
                          onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className="text-[10px] truncate rounded px-1 py-0.5 cursor-pointer leading-tight transition-opacity hover:opacity-70"
                          style={{
                            // color-mix em vez de alpha fixo: o mesmo peso
                            // visual sobre o branco e sobre o navy.
                            background: `color-mix(in srgb, ${e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB'} 15%, transparent)`,
                            color: TIPO_TEXTO[e.tipo] ?? 'var(--brand-cobalt-text)',
                            borderLeft: `2px solid ${e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB'}`,
                          }}
                        >
                          {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {e.titulo}
                        </div>
                      ))}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Coluna do dia ──
            Antes eram tres cartoes: "Briefing", "Proximos Compromissos" e uma
            legenda de tipos. Os dois primeiros listavam os MESMOS compromissos
            quando so havia os de hoje, e a legenda era estatica — os chips do
            resumo ja dizem quais tipos existem. Ficou um cartao so: o dia em
            foco e, abaixo, o que vem DEPOIS dele, sem repetir. */}
        <div className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}>

          <div className="flex items-center justify-between px-4 py-3.5"
            style={{ borderBottom: '1px solid var(--tint-06)' }}>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-[color:var(--text-primary)] truncate">
                {selectedDay
                  ? `${selectedDay} de ${MESES[viewMonth]}`
                  : isCurrentMonth ? 'Hoje' : `${MESES[viewMonth]} ${viewYear}`}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--tint-45)' }}>
                {selectedDay && feriados[fmtKey(selectedDay)]
                  ? feriados[fmtKey(selectedDay)]
                  : emFoco.length === 0
                    ? 'Nada marcado'
                    : janelaDoDia(emFoco)}
              </p>
            </div>
            <button
              onClick={() => openNewOnDay(selectedDay ?? today.getDate())}
              title="Novo compromisso neste dia"
              className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all hover:opacity-80"
              style={{
                background: 'var(--brand-cobalt-soft)',
                color: 'var(--brand-cobalt-text)',
              }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Compromissos do dia em foco */}
          <div className="divide-y" style={{ borderColor: 'var(--tint-04)' }}>
            {emFoco.length === 0 ? (
              <div className="px-4 py-7 text-center">
                <CalendarDays className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--tint-14)' }} />
                <p className="text-sm" style={{ color: 'var(--tint-35)' }}>Dia livre</p>
              </div>
            ) : emFoco.map((e) => <LinhaEvento key={e.id} e={e} onClick={() => openEdit(e)} destaque />)}
          </div>

          {/* O que vem DEPOIS do dia em foco — nunca repete o de cima */}
          {aSeguir.length > 0 && (
            <>
              <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ borderTop: '1px solid var(--tint-06)', borderBottom: '1px solid var(--tint-06)', background: 'var(--bg-card-subtle)' }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--tint-35)' }} />
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>
                  A seguir
                </p>
              </div>
              <div className="divide-y overflow-y-auto max-h-72" style={{ borderColor: 'var(--tint-04)' }}>
                {aSeguir.map((e) => <LinhaEvento key={e.id} e={e} onClick={() => openEdit(e)} comData />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal criar/editar evento ── */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', alignItems: 'center', padding: '1rem' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col"
            style={{
              maxHeight: 'calc(100vh - 1rem)',
              background: 'var(--bg-card)',
              border: '1px solid rgba(37,99,235,0.25)',
            }}
          >
            {/* Cabeçalho do modal */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(37,99,235,0.15)' }}>
              <div className="flex items-center gap-3">
                <TipoIconBox tipo={form.tipo} box={32} icon={15} />
                <h2 className="text-[color:var(--text-primary)] font-semibold">
                  {editEvent ? 'Editar Evento' : 'Novo Evento'}
                </h2>
              </div>
              <button onClick={() => { setShowModal(false); setEditEvent(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--tint-10)]"
                style={{ color: 'var(--tint-55)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">

              {/* Título */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Título *</label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  className={inputCls}
                  style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  placeholder="Nome do evento"
                />
              </div>

              {/* Tipo + Cor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Tipo</label>
                  <Select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, cor: TIPO_COLORS[e.target.value] ?? '' }))}
                    options={Object.entries(TIPO_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Cor</label>
                  <div className="mt-1">
                    <ColorPicker
                      value={form.cor || TIPO_COLORS[form.tipo] || '#2563EB'}
                      onChange={(v) => setForm((f) => ({ ...f, cor: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Data início + Hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Data *</label>
                  <DatePicker
                    value={form.data}
                    onChange={(v) => setForm((f) => ({ ...f, data: v }))}
                    className={inputCls}
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Hora</label>
                  <TimePicker
                    value={form.hora}
                    onChange={(v) => setForm((f) => ({ ...f, hora: v }))}
                    className={inputCls}
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  />
                </div>
              </div>

              {/* Data fim + Hora fim */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Data Fim</label>
                  <DatePicker
                    value={form.dataFim}
                    onChange={(v) => setForm((f) => ({ ...f, dataFim: v }))}
                    className={inputCls}
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Hora Fim</label>
                  <TimePicker
                    value={form.horaFim}
                    onChange={(v) => setForm((f) => ({ ...f, horaFim: v }))}
                    className={inputCls}
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  />
                </div>
              </div>

              {/* Local */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Local / Nome do lugar</label>
                <input value={form.local}
                  onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))}
                  className={inputCls}
                  style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  placeholder="Ex: Câmara Municipal, Escola Estadual..."
                />
              </div>

              {/* Endereço + Geocodificar */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Endereço (aparece no Mapa de Demandas)</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.endereco}
                    onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                    className="flex-1 rounded-lg px-3 py-2 text-[color:var(--text-primary)] text-sm outline-none transition-all placeholder-[color:var(--text-tertiary)]"
                    style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                    placeholder="Rua, número, cidade"
                  />
                  <button onClick={geocodeFormAddress} disabled={geoLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all hover:opacity-80"
                    style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)' }}>
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  </button>
                </div>
                {form.lat && form.lng && (
                  <div className="text-xs mt-1.5">
                    <p className="flex items-start gap-1" style={{ color: 'var(--tipo-visita-texto)' }}>
                      <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>
                        {/* O NOME vem primeiro: e o que permite notar que o
                            servico entendeu outra cidade. */}
                        {geoNome ? <strong style={{ fontWeight: 600 }}>{geoNome}</strong> : 'Endereço localizado'}
                      </span>
                    </p>
                    <p className="mt-0.5 pl-4" style={{ color: 'var(--tint-35)' }}>
                      Confira se é o lugar certo — é aqui que o compromisso aparecerá no mapa.
                    </p>
                  </div>
                )}
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>Descrição</label>
                <textarea value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
                  placeholder="Observações sobre o evento..."
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Rodapé do modal */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(37,99,235,0.15)' }}>
              <div>
                {editEvent && (
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300">
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Excluir
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setShowModal(false); setEditEvent(null); }}
                  className="px-4 py-2 text-sm font-medium transition-all hover:text-white"
                  style={{ color: 'var(--tint-45)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF' }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {editEvent ? 'Atualizar' : 'Salvar Evento'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
