'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X,
  Loader2, CheckCircle, AlertTriangle, MapPin, Navigation, Clock,
} from 'lucide-react';

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
  REUNIAO: '#c9a227', VISITA: '#22c55e', EVENTO: '#818cf8', COMPROMISSO: '#fb923c',
};
const TIPO_ICONS: Record<string, string> = {
  REUNIAO: '🤝', VISITA: '📍', EVENTO: '🎙️', COMPROMISSO: '📋',
};

const EMPTY_FORM = {
  titulo: '', descricao: '', data: '', dataFim: '', hora: '09:00', horaFim: '',
  local: '', endereco: '', tipo: 'REUNIAO', cor: '',
  lat: null as number | null, lng: null as number | null,
};

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

  const openNewOnDay = (day: number) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    setEditEvent(null);
    setForm({ ...EMPTY_FORM, data: dateStr });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (e: AgendaEvent) => {
    const d = new Date(e.data);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditEvent(e);
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

  const inputCls = "mt-1 w-full rounded-lg px-3 py-2 text-white text-sm outline-none transition-all"
    + " placeholder-white/20"
    + " focus:border-[#c9a227]/60";

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 50%, #0c2a4f 100%)' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#c9a227' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-4 md:p-6" style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 50%, #0c2a4f 100%)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.3)' }}
          >
            <CalendarDays className="w-5 h-5" style={{ color: '#c9a227' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Agenda do Gabinete</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {events.length} evento{events.length !== 1 ? 's' : ''} em {MESES[viewMonth]}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setEditEvent(null); setForm({ ...EMPTY_FORM }); setFormError(''); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #c9a227, #e6b83a)', color: '#04111f' }}
        >
          <Plus className="w-4 h-4" />
          Novo Evento
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Calendário ── */}
        <div
          className="lg:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(7,29,54,0.7)', border: '1px solid rgba(201,162,39,0.15)', backdropFilter: 'blur(8px)' }}
        >
          {/* Navegação do mês */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-lg tracking-wide">
                {MESES[viewMonth]}{' '}
                <span style={{ color: '#c9a227' }}>{viewYear}</span>
              </h2>
              {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
                <button
                  onClick={goToday}
                  className="text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-80"
                  style={{ background: 'rgba(201,162,39,0.15)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.25)' }}
                >
                  Hoje
                </button>
              )}
            </div>

            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {DIAS_SEMANA.map((d, i) => (
              <div key={d} className="text-center py-2.5 text-xs font-semibold uppercase tracking-widest"
                style={{ color: i === 0 || i === 6 ? 'rgba(201,162,39,0.6)' : 'rgba(255,255,255,0.3)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Células do calendário */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#c9a227' }} />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) return (
                  <div key={`empty-${idx}`} className="h-24"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)' }} />
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
                    className="h-24 p-1.5 cursor-pointer transition-all group"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                      background: isSel
                        ? 'rgba(201,162,39,0.08)'
                        : isWeekend ? 'rgba(255,255,255,0.012)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSel ? 'rgba(201,162,39,0.08)' : isWeekend ? 'rgba(255,255,255,0.012)' : 'transparent'; }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className="text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                        style={isTod
                          ? { background: 'linear-gradient(135deg, #c9a227, #e6b83a)', color: '#04111f', fontWeight: 800 }
                          : feriado
                            ? { color: '#f87171' }
                            : isWeekend
                              ? { color: 'rgba(201,162,39,0.5)' }
                              : { color: 'rgba(255,255,255,0.75)' }
                        }
                      >
                        {day}
                      </span>
                      {isSel && !isTod && (
                        <span className="w-1.5 h-1.5 rounded-full mt-2 mr-0.5" style={{ background: '#c9a227' }} />
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
                            background: (e.cor ?? TIPO_COLORS[e.tipo] ?? '#c9a227') + '22',
                            color: e.cor ?? TIPO_COLORS[e.tipo] ?? '#c9a227',
                            borderLeft: `2px solid ${e.cor ?? TIPO_COLORS[e.tipo] ?? '#c9a227'}`,
                          }}
                        >
                          {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {e.titulo}
                        </div>
                      ))}
                      {dayEvs.length > (feriado ? 1 : 2) && (
                        <div className="text-[10px] px-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
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

          {/* Eventos do dia selecionado */}
          {selectedDay && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(7,29,54,0.7)', border: '1px solid rgba(201,162,39,0.2)', backdropFilter: 'blur(8px)' }}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p className="text-white font-semibold text-sm">
                    {selectedDay} de {MESES[viewMonth]}
                  </p>
                  {feriados[fmtKey(selectedDay)] && (
                    <p className="text-xs mt-0.5" style={{ color: '#f87171' }}>{feriados[fmtKey(selectedDay)]}</p>
                  )}
                </div>
                <button onClick={() => openNewOnDay(selectedDay)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:opacity-80"
                  style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.3)', color: '#c9a227' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {dayEvents.length === 0 ? (
                  <p className="text-sm px-4 py-6 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Nenhum evento neste dia</p>
                ) : (
                  dayEvents.map((e) => (
                    <button key={e.id} onClick={() => openEdit(e)}
                      className="w-full text-left px-4 py-3 transition-all hover:bg-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.cor ?? TIPO_COLORS[e.tipo] ?? '#c9a227' }} />
                        <span className="text-white text-sm font-medium truncate">{e.titulo}</span>
                      </div>
                      <div className="flex items-center gap-3 ml-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
                      {e.descricao && (
                        <p className="text-xs mt-1 ml-4 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{e.descricao}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Próximos eventos */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(7,29,54,0.7)', border: '1px solid rgba(201,162,39,0.15)', backdropFilter: 'blur(8px)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Próximos Compromissos
              </p>
            </div>
            <div className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {upcomingEvents.length === 0 ? (
                <p className="text-sm px-4 py-5 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Nenhum evento futuro</p>
              ) : upcomingEvents.map((e) => {
                const color = e.cor ?? TIPO_COLORS[e.tipo] ?? '#c9a227';
                return (
                  <button key={e.id} onClick={() => openEdit(e)}
                    className="w-full text-left px-4 py-3 transition-all hover:bg-white/5 group">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 text-sm"
                        style={{ background: color + '20', border: `1px solid ${color}40` }}>
                        {TIPO_ICONS[e.tipo] ?? '📌'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{e.titulo}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
            style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Legenda
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TIPO_LABELS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-sm">{TIPO_ICONS[k]}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal criar/editar evento ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
            style={{
              background: 'linear-gradient(160deg, #071d36 0%, #0c2a4f 100%)',
              border: '1px solid rgba(201,162,39,0.25)',
            }}
          >
            {/* Cabeçalho do modal */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(201,162,39,0.15)' }}>
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                  style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.3)' }}
                >
                  {TIPO_ICONS[form.tipo] ?? '📌'}
                </span>
                <h2 className="text-white font-semibold">
                  {editEvent ? 'Editar Evento' : 'Novo Evento'}
                </h2>
              </div>
              <button onClick={() => { setShowModal(false); setEditEvent(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">

              {/* Título */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Título *</label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  className={inputCls}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="Nome do evento"
                />
              </div>

              {/* Tipo + Cor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, cor: TIPO_COLORS[e.target.value] ?? '' }))}
                    className={inputCls}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k} style={{ background: '#071d36' }}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Cor</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="color"
                      value={form.cor || TIPO_COLORS[form.tipo] || '#c9a227'}
                      onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                      className="w-10 h-9 rounded-lg cursor-pointer border"
                      style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }}
                    />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{form.cor || TIPO_COLORS[form.tipo] || '#c9a227'}</span>
                  </div>
                </div>
              </div>

              {/* Data início + Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Data *</label>
                  <input type="date" value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                    className={inputCls}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Hora</label>
                  <input type="time" value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className={inputCls}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Data fim + Hora fim */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Data Fim</label>
                  <input type="date" value={form.dataFim}
                    onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))}
                    className={inputCls}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Hora Fim</label>
                  <input type="time" value={form.horaFim}
                    onChange={(e) => setForm((f) => ({ ...f, horaFim: e.target.value }))}
                    className={inputCls}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Local */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Local / Nome do lugar</label>
                <input value={form.local}
                  onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))}
                  className={inputCls}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="Ex: Câmara Municipal, Escola Estadual..."
                />
              </div>

              {/* Endereço + Geocodificar */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Endereço (aparece no Mapa de Demandas)</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.endereco}
                    onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                    className="flex-1 rounded-lg px-3 py-2 text-white text-sm outline-none transition-all placeholder-white/20"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder="Rua, número, cidade"
                  />
                  <button onClick={geocodeFormAddress} disabled={geoLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all hover:opacity-80"
                    style={{ background: 'rgba(201,162,39,0.2)', border: '1px solid rgba(201,162,39,0.3)', color: '#c9a227' }}>
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  </button>
                </div>
                {form.lat && form.lng && (
                  <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#22c55e' }}>
                    <CheckCircle className="w-3 h-3" />
                    Localizado: {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                    <span className="ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>— aparecerá no Mapa de Demandas</span>
                  </p>
                )}
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Descrição</label>
                <textarea value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
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
              style={{ borderTop: '1px solid rgba(201,162,39,0.15)' }}>
              <div>
                {editEvent && (
                  <button onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Excluir
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setShowModal(false); setEditEvent(null); }}
                  className="px-4 py-2 text-sm font-medium transition-all hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9a227, #e6b83a)', color: '#04111f' }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {editEvent ? 'Atualizar' : 'Salvar Evento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
