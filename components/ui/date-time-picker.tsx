'use client';

import { useState, useEffect, useRef } from 'react';
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
        <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
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
              <div key={i} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: 'var(--text-tertiary)' }}>
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
              style={{ color: 'var(--text-tertiary)' }}
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
              style={{ color: 'var(--acento-azul)' }}
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
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
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
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Horário</span>
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

// ─── ColorPicker ───────────────────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (d) {
    if      (max === r) h = ((g-b)/d + (g<b?6:0)) / 6;
    else if (max === g) h = ((b-r)/d + 2) / 6;
    else                h = ((r-g)/d + 4) / 6;
  }
  return [Math.round(h*360), max ? Math.round(d/max*100) : 0, Math.round(max*100)];
}

function hexToRgb(hex: string): [number,number,number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const initHsv = (): [number,number,number] => {
    const rgb = hexToRgb(value || '#2563EB') ?? [37,99,235];
    return rgbToHsv(...rgb);
  };

  const [open, setOpen]           = useState(false);
  const [[hue, sat, bri], setHsv] = useState<[number,number,number]>(initHsv);
  const [hexInput, setHexInput]   = useState(value || '#2563EB');
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const popoverRef  = useRef<HTMLDivElement>(null);
  const gradRef     = useRef<HTMLDivElement>(null);
  const hueRef      = useRef<HTMLDivElement>(null);
  // Tracks the last hex we emitted ourselves to avoid re-syncing from value
  const lastEmitted = useRef('');
  // Always-current HSV so drag closures never read stale state
  const hsvRef = useRef<[number,number,number]>([hue, sat, bri]);
  hsvRef.current = [hue, sat, bri];

  useEffect(() => {
    // Ignore value changes that we triggered ourselves
    if (value === lastEmitted.current) return;
    const rgb = hexToRgb(value || '#2563EB');
    if (rgb) { setHsv(rgbToHsv(...rgb)); setHexInput(value || '#2563EB'); }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const emit = (h: number, s: number, v: number) => {
    const hex = rgbToHex(...hsvToRgb(h, s, v));
    setHexInput(hex);
    lastEmitted.current = hex;
    onChange(hex);
  };

  const handleGrad = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = gradRef.current!;
    el.setPointerCapture(e.pointerId);
    const update = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const s = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100);
      const v = Math.round(Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)) * 100);
      const [h] = hsvRef.current; // read current hue without stale closure
      setHsv([h, s, v]);
      emit(h, s, v);
    };
    const up = () => { el.removeEventListener('pointermove', update); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', update);
    el.addEventListener('pointerup', up);
    update(e.nativeEvent);
  };

  const handleHue = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hueRef.current!;
    el.setPointerCapture(e.pointerId);
    const update = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const h = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 360);
      const [, s, v] = hsvRef.current; // read current sat/bri without stale closure
      setHsv([h, s, v]);
      emit(h, s, v);
    };
    const up = () => { el.removeEventListener('pointermove', update); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', update);
    el.addEventListener('pointerup', up);
    update(e.nativeEvent);
  };

  const commitHex = (raw: string) => {
    const rgb = hexToRgb(raw);
    if (rgb) {
      const hsv = rgbToHsv(...rgb);
      setHsv(hsv);
      const hex = raw.startsWith('#') ? raw : '#' + raw;
      lastEmitted.current = hex;
      onChange(hex);
    }
  };

  const currentHex = rgbToHex(...hsvToRgb(hue, sat, bri));
  const hueHex     = rgbToHex(...hsvToRgb(hue, 100, 100));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 w-full transition-all hover:opacity-90"
        style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', userSelect: 'none' }}
      >
        <span
          className="w-5 h-5 rounded-md flex-shrink-0"
          style={{ background: currentHex, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }}
        />
        <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
          {currentHex.toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-1 z-50 rounded-xl p-3"
          style={{
            width: 220,
            background: 'var(--bg-card)',
            border: '1px solid var(--tint-14)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
          }}
        >
          {/* Gradient panel: saturation × brightness */}
          <div
            ref={gradRef}
            className="relative rounded-lg mb-2.5 cursor-crosshair select-none"
            style={{
              height: 148,
              background: `linear-gradient(to bottom, transparent, #000),
                           linear-gradient(to right, #fff, ${hueHex})`,
              touchAction: 'none',
            }}
            onPointerDown={handleGrad}
          >
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${sat}%`,
                top: `${100 - bri}%`,
                transform: 'translate(-50%, -50%)',
                background: currentHex,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
              }}
            />
          </div>

          {/* Hue slider */}
          <div
            ref={hueRef}
            className="relative rounded-full mb-3 cursor-pointer select-none"
            style={{
              height: 12,
              background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
              touchAction: 'none',
            }}
            onPointerDown={handleHue}
          >
            <div
              className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${(hue / 360) * 100}%`,
                transform: 'translate(-50%, -50%)',
                background: hueHex,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-md flex-shrink-0"
              style={{ background: currentHex, border: '1px solid var(--tint-14)' }}
            />
            <input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitHex(hexInput); }}
              maxLength={7}
              spellCheck={false}
              className="flex-1 rounded-md px-2 py-1.5 text-xs font-mono outline-none"
              style={{
                background: 'var(--tint-06)',
                border: '1px solid var(--tint-14)',
                color: 'var(--text-primary)',
              }}
              placeholder="#2563EB"
            />
          </div>
        </div>
      )}
    </div>
  );
}
