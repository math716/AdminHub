'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock, ChevronUp, ChevronDown } from 'lucide-react';

// ─── DatePicker ────────────────────────────────────────────────────────────

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['D','S','T','Q','Q','S','S'];

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function DatePicker({ value, onChange, className, style }: DatePickerProps) {
  const today = new Date();
  const selected = value ? new Date(value + 'T12:00:00') : null;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());
  const [viewYear, setViewYear]   = useState(selected?.getFullYear() ?? today.getFullYear());

  useEffect(() => {
    if (selected) {
      setViewMonth(selected.getMonth());
      setViewYear(selected.getFullYear());
    }
  }, [value]);

  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekDay  = new Date(viewYear, viewMonth, 1).getDay();

  const select = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(d.toISOString().split('T')[0]);
    setOpen(false);
  };

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

  const displayValue = selected
    ? selected.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div className="relative">
      {/* Input trigger */}
      <div
        className={className}
        style={{ ...style, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: displayValue ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '14px' }}>
          {displayValue || 'dd/mm/aaaa'}
        </span>
        <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
      </div>

      {/* Calendar popover */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl p-3 w-64"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--tint-14)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--tint-08)]"
            >
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {MESES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--tint-08)]"
            >
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: 'var(--tint-35)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: firstWeekDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday    = today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
              const isSelected = selected?.getDate() === day && selected?.getMonth() === viewMonth && selected?.getFullYear() === viewYear;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => select(day)}
                  className="h-8 w-full rounded-lg text-xs font-medium transition-all hover:opacity-90"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg,#2563EB,#3B82F6)'
                      : isToday
                      ? 'rgba(37,99,235,0.18)'
                      : 'transparent',
                    color: isSelected ? '#fff' : isToday ? '#60A5FA' : 'var(--text-primary)',
                    border: isToday && !isSelected ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
                    fontWeight: isSelected || isToday ? 700 : 400,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--tint-08)' }}>
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs font-medium transition-colors hover:text-white"
              style={{ color: 'var(--tint-35)' }}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMonth(today.getMonth());
                setViewYear(today.getFullYear());
                select(today.getDate());
              }}
              className="text-xs font-semibold"
              style={{ color: '#60A5FA' }}
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TimePicker ────────────────────────────────────────────────────────────

interface TimePickerProps {
  value: string; // HH:MM
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function TimePicker({ value, onChange, className, style }: TimePickerProps) {
  const parse = (v: string) => {
    const parts = (v || '09:00').split(':');
    return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
  };

  const [open, setOpen]       = useState(false);
  const [hours, setHours]     = useState(parse(value).h);
  const [minutes, setMinutes] = useState(parse(value).m);

  useEffect(() => {
    const p = parse(value);
    setHours(p.h);
    setMinutes(p.m);
  }, [value]);

  const emit = (h: number, m: number) => {
    onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  };

  const changeH = (delta: number) => { const h = (hours + delta + 24) % 24; setHours(h); emit(h, minutes); };
  const changeM = (delta: number) => { const m = (minutes + delta + 60) % 60; setMinutes(m); emit(hours, m); };

  const displayValue = value ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}` : '';

  const spinnerBtn = 'w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--tint-08)]';

  return (
    <div className="relative">
      {/* Input trigger */}
      <div
        className={className}
        style={{ ...style, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: displayValue ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '14px' }}>
          {displayValue || '--:--'}
        </span>
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
      </div>

      {/* Time popover */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl p-4 w-48"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--tint-14)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-1 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--tint-35)' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--tint-35)' }}>Horário</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            {/* Hours */}
            <div className="flex flex-col items-center gap-1">
              <button type="button" className={spinnerBtn} onClick={() => changeH(1)}>
                <ChevronUp className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
              </button>
              <div
                className="w-12 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-14)', color: 'var(--text-primary)' }}
              >
                {String(hours).padStart(2,'0')}
              </div>
              <button type="button" className={spinnerBtn} onClick={() => changeH(-1)}>
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
              </button>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--tint-25)' }}>h</span>
            </div>

            <span className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>:</span>

            {/* Minutes */}
            <div className="flex flex-col items-center gap-1">
              <button type="button" className={spinnerBtn} onClick={() => changeM(5)}>
                <ChevronUp className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
              </button>
              <div
                className="w-12 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-14)', color: 'var(--text-primary)' }}
              >
                {String(minutes).padStart(2,'0')}
              </div>
              <button type="button" className={spinnerBtn} onClick={() => changeM(-5)}>
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--tint-45)' }} />
              </button>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--tint-25)' }}>min</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: '#fff' }}
          >
            Confirmar
          </button>
        </div>
      )}
    </div>
  );
}
