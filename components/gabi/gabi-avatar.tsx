'use client';

import { useId } from 'react';

/**
 * Personagem da Gabi — assessora de gabinete (SVG flat, escala em qualquer
 * tamanho, funciona nos dois temas). Estilo profissional, com blazer.
 */
export function GabiAvatar({ size = 40 }: { size?: number }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = `gg${raw}`;
  const c = `gc${raw}`;
  const hair = '#4a3020';

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }} aria-label="Gabi">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d6fd8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <clipPath id={c}><circle cx="24" cy="24" r="24" /></clipPath>
      </defs>

      <g clipPath={`url(#${c})`}>
        {/* fundo */}
        <circle cx="24" cy="24" r="24" fill={`url(#${g})`} />
        {/* blazer (ombros) */}
        <path d="M7 49 C7 39.5 13.5 35 24 35 C34.5 35 41 39.5 41 49 Z" fill="#22314d" />
        {/* gola / blusa por baixo */}
        <path d="M24 35 L19.5 40 L24 44 L28.5 40 Z" fill="#eef2f7" />
        <path d="M20 35.5 L24 40 L18 41.5 Z" fill="#2c3e5f" />
        <path d="M28 35.5 L24 40 L30 41.5 Z" fill="#2c3e5f" />
        {/* cabelo (atrás) — comprido nas laterais */}
        <path d="M11 25 C11 13.5 37 13.5 37 25 C37 30.5 35.5 34 33.5 36 L33.5 24 C33.5 16.5 14.5 16.5 14.5 24 L14.5 36 C12.5 34 11 30.5 11 25 Z" fill={hair} />
        {/* rosto */}
        <ellipse cx="24" cy="23.5" rx="8.4" ry="9.4" fill="#f4cda2" />
        {/* franja lateral */}
        <path d="M15.4 23.5 C15.4 15 32.6 15 32.6 23.5 C32.6 19.5 30 17 26.5 17 C25 19.5 18.5 19 16.8 21 C16 21.8 15.4 22.6 15.4 23.5 Z" fill={hair} />
        {/* sobrancelhas */}
        <path d="M18.9 21.2 Q20.6 20.4 22.3 21.2" stroke="#5a3b28" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        <path d="M25.7 21.2 Q27.4 20.4 29.1 21.2" stroke="#5a3b28" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        {/* olhos */}
        <circle cx="20.6" cy="23.6" r="1.15" fill="#2f2a26" />
        <circle cx="27.4" cy="23.6" r="1.15" fill="#2f2a26" />
        {/* blush */}
        <circle cx="18.7" cy="26.2" r="1.4" fill="rgba(232,120,100,0.4)" />
        <circle cx="29.3" cy="26.2" r="1.4" fill="rgba(232,120,100,0.4)" />
        {/* sorriso */}
        <path d="M21.4 27.6 Q24 29.8 26.6 27.6" stroke="#bd5f47" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        {/* brinco discreto */}
        <circle cx="15.6" cy="27.4" r="0.8" fill="#ffd76a" />
        <circle cx="32.4" cy="27.4" r="0.8" fill="#ffd76a" />
      </g>
    </svg>
  );
}
