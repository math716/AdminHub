'use client';

// Esqueleto de carregamento e estado vazio padrão do sistema.
//
// Esqueleto: um bloco com brilho correndo, no formato do que vai aparecer —
// dá a sensação de que a tela já está montada, em vez da rodinha sozinha.
// EstadoVazioPadrao: quando não há nada, um convite claro (o que aparece aqui
// e, se houver, o que fazer), em vez de "Nenhum resultado".

import type { LucideIcon } from 'lucide-react';

export function Esqueleto({ className = '', redondo = false }: { className?: string; redondo?: boolean }) {
  return <div aria-hidden className={`esqueleto ${redondo ? 'rounded-full' : 'rounded-2xl'} ${className}`} />;
}

/** Linhas de esqueleto para listas (cartões ou linhas de tabela). */
export function EsqueletoLista({ linhas = 5, altura = 'h-14' }: { linhas?: number; altura?: string }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => <Esqueleto key={i} className={altura} />)}
    </div>
  );
}

export function EstadoVazioPadrao({ icone: Icone, titulo, texto, acao }: {
  icone: LucideIcon;
  titulo: string;
  texto?: string;
  /** Botão opcional (ex.: "Nova demanda"). */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <span className="relative mb-3">
        <span aria-hidden className="absolute inset-0 rounded-2xl blur-xl" style={{ background: 'var(--brand-cobalt-soft)' }} />
        <span className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--brand-cobalt-soft)', color: 'var(--brand-cobalt-text)', border: '1px solid var(--border-default)' }}>
          <Icone className="w-5 h-5" />
        </span>
      </span>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
      {texto && <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
