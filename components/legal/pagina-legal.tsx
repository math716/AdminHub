// Moldura das páginas legais (política de privacidade e termos de uso).
//
// São PÚBLICAS de propósito: o Google exige que a política de privacidade seja
// acessível sem login para aprovar a verificação do OAuth. O middleware só
// protege /dashboard, então elas ficam abertas naturalmente.

import Link from 'next/link';
import type { ReactNode } from 'react';

export function PaginaLegal({
  titulo, atualizadoEm, children,
}: { titulo: string; atualizadoEm: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-card)' }}>
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
            <span className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>AdminHub</span>
          </Link>
          <Link href="/login" className="text-[13px] font-medium" style={{ color: 'var(--brand-cobalt-text)' }}>
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-bold tracking-[-0.02em]" style={{ fontSize: 30, color: 'var(--text-primary)' }}>
          {titulo}
        </h1>
        <p className="mt-1.5" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Última atualização: {atualizadoEm}
        </p>
        <div className="mt-8 legal-corpo">{children}</div>
      </main>

      <footer style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-wrap gap-x-5 gap-y-2 items-center"
          style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          <span>AdminHub — Plataforma de Gabinete Político</span>
          <Link href="/politica-de-privacidade" style={{ color: 'var(--brand-cobalt-text)' }}>Política de Privacidade</Link>
          <Link href="/termos-de-uso" style={{ color: 'var(--brand-cobalt-text)' }}>Termos de Uso</Link>
        </div>
      </footer>
    </div>
  );
}

/** Seção numerada do documento. */
export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="font-bold tracking-[-0.01em]" style={{ fontSize: 18, color: 'var(--text-primary)' }}>
        {titulo}
      </h2>
      <div className="mt-3 space-y-3" style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

/** Lista de itens do documento. */
export function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="space-y-2 mt-1">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="flex-shrink-0 rounded-full"
            style={{ width: 4, height: 4, background: 'var(--brand-cobalt)', marginTop: 10 }} />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloco de destaque — usado no que o Google precisa achar rápido. */
export function Destaque({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3.5 mt-2"
      style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid var(--gabi-balao-borda)' }}>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
}
