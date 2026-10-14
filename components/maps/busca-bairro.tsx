'use client';

// Campo "Buscar bairro…" do Mapa Eleitoral. Lista os bairros (ou distritos,
// ou regiões administrativas) do mapa aberto; ao escolher um, a tela seleciona
// e o mapa aproxima nele. Ignora acento e maiúscula: "sao joao" acha "SÃO JOÃO".

import { useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizarNomeBairro } from '@/hooks/use-foco-poligono';

export interface OpcaoBairro {
  nome: string;
  votos?: number;
}

interface BuscaBairroProps {
  opcoes: OpcaoBairro[];
  onEscolher: (nome: string) => void;
  placeholder?: string;
}

export function BuscaBairro({ opcoes, onEscolher, placeholder = 'Buscar bairro…' }: BuscaBairroProps) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  // Todos os que combinam — sem corte. Primeiro os que começam pelo texto,
  // depois os que o contêm; dentro de cada grupo, os mais votados no topo.
  const resultados = useMemo(() => {
    const alvo = normalizarNomeBairro(texto);
    const comNorm = opcoes.map(o => ({ ...o, norm: normalizarNomeBairro(o.nome) }));
    const filtrados = alvo ? comNorm.filter(o => o.norm.includes(alvo)) : comNorm;
    return filtrados.sort((a, b) =>
      Number(b.norm.startsWith(alvo)) - Number(a.norm.startsWith(alvo)) ||
      (b.votos ?? 0) - (a.votos ?? 0) ||
      a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [opcoes, texto]);

  const escolher = (nome: string) => {
    onEscolher(nome);
    setTexto('');
    setAberto(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const moverAtivo = (novo: number) => {
    const i = Math.max(0, Math.min(resultados.length - 1, novo));
    setAtivo(i);
    listaRef.current?.children[i]?.scrollIntoView({ block: 'nearest' });
  };

  if (opcoes.length === 0) return null;

  return (
    <div className="relative w-full sm:w-60">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: '#4a7a9b' }} />
      <Input
        value={texto}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        // O clique na lista acontece antes do blur fechar (onMouseDown abaixo).
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); moverAtivo(ativo + 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); moverAtivo(ativo - 1); }
          else if (e.key === 'Enter' && resultados[ativo]) { e.preventDefault(); escolher(resultados[ativo].nome); }
          else if (e.key === 'Escape') { setAberto(false); }
        }}
        className="pl-8 pr-7 h-8 text-xs"
      />
      {texto && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setTexto(''); setAtivo(0); }}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: '#4a7a9b' }}
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {aberto && (
        // z acima dos controles do Leaflet (1000): a lista abre por cima do mapa.
        <div
          ref={listaRef}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-[1100] max-h-64 overflow-y-auto scrollbar-dark rounded-lg py-1"
          style={{ background: 'var(--bg-card-raised)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-raised)' }}
        >
          {resultados.length === 0 ? (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Nenhum bairro encontrado</p>
          ) : resultados.map((o, i) => (
            <button
              key={o.nome}
              type="button"
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => { e.preventDefault(); escolher(o.nome); }}
              onMouseEnter={() => setAtivo(i)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left"
              style={{ background: i === ativo ? 'rgba(74,158,222,0.12)' : undefined, color: 'var(--text-primary)' }}
            >
              <span className="text-xs font-medium truncate">{o.nome}</span>
              {o.votos != null && (
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--acento-azul)' }}>
                  {o.votos.toLocaleString('pt-BR')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
