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
import { StatCard } from '@/components/ui/stat-card';
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

  const upcomingEvents = events
    .filter((e) => new Date(e.data) >= today)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    .slice(0, 8);

  const inputCls = "mt-1 w-full rounded-lg px-3 py-2 text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] text-sm outline-none transition-all"
    + " placeholder-[color:var(--text-tertiary)]"
    + " focus:border-[#2563EB]/60";

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, var(--bg-page) 0%, var(--bg-card) 50%, var(--bg-card) 100%)' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#2563EB' }} />
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

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(TIPO_LABELS).map(([tipo, label], i) => {
          const count = statsByTipo[tipo] ?? 0;
          const color = TIPO_COLORS[tipo];
          const tipoIconMap: Record<string, any> = {
            REUNIAO: Users, VISITA: MapPin, EVENTO: Mic, COMPROMISSO: Briefcase,
          };
          return (
            <StatCard
              key={tipo}
              label={label}
              value={count}
              icon={tipoIconMap[tipo] ?? CalendarDays}
              color={color}
              delay={i * 0.05}
            />
          );
        })}
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
                <span style={{ color: '#2563EB' }}>{viewYear}</span>
              </h2>
              {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
                <button
                  onClick={goToday}
                  className="text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-80"
                  style={{ background: 'rgba(37,99,235,0.15)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.25)' }}
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
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#2563EB' }} />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) return (
                  <div key={`empty-${idx}`} className="h-16 md:h-24"
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
                    className="h-16 md:h-24 p-1 md:p-1.5 cursor-pointer transition-all group"
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
                            ? { color: '#f87171' }
                            : isWeekend
                              ? { color: 'rgba(37,99,235,0.5)' }
                              : { color: 'var(--tint-75)' }
                        }
                      >
                        {day}
                      </span>
                      {isSel && !isTod && (
                        <span className="w-1.5 h-1.5 rounded-full mt-2 mr-0.5" style={{ background: '#2563EB' }} />
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
                            background: (e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB') + '22',
                            color: e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB',
                            borderLeft: `2px solid ${e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB'}`,
                          }}
                        >
                          {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {e.titulo}
                        </div>
                      ))}
                      {dayEvs.length > (feriado ? 1 : 2) && (
                        <div className="text-[10px] px-1" style={{ color: 'var(--tint-35)' }}>
                          +{dayEvs.length - (feriado ? 1 : 2)} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Painel lateral ── */}
        <div className="flex flex-col gap-4">

          {/* Briefing do Dia */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.2)', backdropFilter: 'blur(8px)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--tint-06)' }}>
              <div>
                <p className="text-[color:var(--text-primary)] font-semibold text-sm">
                  {selectedDay
                    ? `${selectedDay} de ${MESES[viewMonth]}`
                    : isCurrentMonth
                      ? `Briefing — ${today.getDate()} de ${MESES[today.getMonth()]}`
                      : `${MESES[viewMonth]} ${viewYear}`}
                </p>
                {selectedDay && feriados[fmtKey(selectedDay)] && (
                  <p className="text-xs mt-0.5" style={{ color: '#f87171' }}>{feriados[fmtKey(selectedDay)]}</p>
                )}
                {!selectedDay && isCurrentMonth && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--tint-35)' }}>
                    {todayEvents.length === 0 ? 'Dia livre' : `${todayEvents.length} evento${todayEvents.length > 1 ? 's' : ''} hoje`}
                  </p>
                )}
              </div>
              <button
                onClick={() => openNewOnDay(selectedDay ?? today.getDate())}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)', color: '#2563EB' }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--tint-04)' }}>
              {(selectedDay ? dayEvents : todayEvents).length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <TrendingUp className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--tint-14)' }} />
                  <p className="text-sm" style={{ color: 'var(--tint-35)' }}>Nenhum evento</p>
                </div>
              ) : (
                (selectedDay ? dayEvents : todayEvents).map((e, idx) => {
                  const color = e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB';
                  return (
                    <button key={e.id} onClick={() => openEdit(e)}
                      className="w-full text-left px-4 py-3 transition-all hover:bg-[var(--tint-06)]">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center mt-0.5">
                          <TipoIconBox tipo={e.tipo} box={28} icon={13} />
                          {idx < (selectedDay ? dayEvents : todayEvents).length - 1 && (
                            <div className="w-px flex-1 mt-1" style={{ background: 'var(--tint-06)', minHeight: 12 }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{e.titulo}</p>
                          <div className="flex items-center gap-3 mt-0.5" style={{ color: 'var(--tint-45)' }}>
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="w-3 h-3" />
                              {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {e.local && (
                              <span className="flex items-center gap-1 text-xs truncate">
                                <MapPin className="w-3 h-3" />
                                {e.local}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Próximos Compromissos */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.15)', backdropFilter: 'blur(8px)' }}
          >
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--tint-06)' }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#2563EB' }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-45)' }}>
                Próximos Compromissos
              </p>
            </div>
            <div className="divide-y max-h-48 md:max-h-72 overflow-y-auto" style={{ borderColor: 'var(--tint-04)' }}>
              {upcomingEvents.length === 0 ? (
                <p className="text-sm px-4 py-5 text-center" style={{ color: 'var(--tint-35)' }}>Nenhum evento futuro</p>
              ) : upcomingEvents.map((e) => {
                const color = e.cor ?? TIPO_COLORS[e.tipo] ?? '#2563EB';
                return (
                  <button key={e.id} onClick={() => openEdit(e)}
                    className="w-full text-left px-4 py-3 transition-all hover:bg-[var(--tint-06)] group">
                    <div className="flex items-center gap-2.5">
                      <TipoIconBox tipo={e.tipo} box={28} icon={13} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[color:var(--text-primary)] text-xs font-medium truncate">{e.titulo}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--tint-35)' }}>
                          {new Date(e.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          {' · '}
                          {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legenda de tipos */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-06)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--tint-35)' }}>
              Tipos de Evento
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIPO_LABELS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <TipoIconBox tipo={k} box={24} icon={12} />
                  <span className="text-xs" style={{ color: 'var(--tint-55)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
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
                    style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)', color: '#2563EB' }}>
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  </button>
                </div>
                {form.lat && form.lng && (
                  <div className="text-xs mt-1.5">
                    <p className="flex items-start gap-1" style={{ color: '#22c55e' }}>
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
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
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
