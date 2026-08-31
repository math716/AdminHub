'use client';

// Sede do gabinete — ponto de partida das rotas do dia.
//
// Antes disto, a rota no Mapa do Gabinete começava no primeiro compromisso e
// ignorava o trajeto de saída, que costuma ser o mais longo do dia.
//
// Guarda o endereço E a coordenada: geocodificar na hora de traçar a rota
// gastaria uma consulta ao Nominatim a cada abertura do painel, e o limite é de
// uma por segundo.

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';

interface Sede {
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  podeEditar: boolean;
}

export function SedeGabinete() {
  const [sede, setSede] = useState<Sede | null>(null);
  const [texto, setTexto] = useState('');
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [nomeAchado, setNomeAchado] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/gabinete/sede');
      if (!res.ok) return;
      const j: Sede = await res.json();
      setSede(j);
      setTexto(j.endereco ?? '');
      setCoord(j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null);
    } catch { /* a tela mostra o estado vazio */ }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const localizar = useCallback(async () => {
    const q = texto.trim();
    if (!q) return;
    setBuscando(true);
    setErro('');
    setSalvo(false);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(q)}`);
      const j = await res.json();
      const r = j?.results?.[0];
      if (!r) {
        setErro('Não localizei esse endereço. Tente com a rua, o número e a cidade.');
        setCoord(null);
        setNomeAchado('');
        return;
      }
      setCoord({ lat: r.lat, lng: r.lng });
      // O NOME é o que permite notar que o serviço entendeu outro lugar.
      setNomeAchado(r.displayName || r.endereco || '');
    } catch {
      setErro('Falha ao consultar o endereço.');
    } finally {
      setBuscando(false);
    }
  }, [texto]);

  const salvar = useCallback(async () => {
    setSalvando(true);
    setErro('');
    try {
      const res = await fetch('/api/gabinete/sede', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endereco: texto.trim(), lat: coord?.lat, lng: coord?.lng }),
      });
      const j = await res.json();
      if (!res.ok) { setErro(j?.error ?? 'Não foi possível salvar.'); return; }
      setSalvo(true);
      carregar();
    } catch {
      setErro('Falha de conexão ao salvar.');
    } finally {
      setSalvando(false);
    }
  }, [texto, coord, carregar]);

  const limpar = useCallback(async () => {
    setSalvando(true);
    try {
      await fetch('/api/gabinete/sede', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endereco: '' }),
      });
      setTexto(''); setCoord(null); setNomeAchado(''); setSalvo(false);
      carregar();
    } finally {
      setSalvando(false);
    }
  }, [carregar]);

  if (!sede) return null;

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--tint-08)',
  };

  const mudou = texto.trim() !== (sede.endereco ?? '')
    || coord?.lat !== sede.lat || coord?.lng !== sede.lng;

  return (
    <div className="rounded-2xl overflow-hidden" style={cardStyle}>
      <div className="px-5 py-4 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--tint-06)' }}>
        <MapPin className="w-4 h-4" style={{ color: '#2563EB' }} />
        <h2 className="font-semibold text-sm text-[color:var(--text-primary)]">Sede do gabinete</h2>
      </div>

      <div className="p-5 space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--tint-45)' }}>
          De onde o parlamentar costuma sair. A rota do dia no Mapa do Gabinete começa por
          aqui — sem isso, ela ignora o primeiro deslocamento, que costuma ser o mais longo.
        </p>

        {!sede.podeEditar ? (
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--tint-04)' }}>
            <p className="text-sm text-[color:var(--text-primary)]">
              {sede.endereco || 'Nenhum endereço cadastrado.'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--tint-35)' }}>
              Só o chefe de gabinete, o agente político ou um administrador podem alterar.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={texto}
                onChange={e => { setTexto(e.target.value); setCoord(null); setNomeAchado(''); setSalvo(false); }}
                onKeyDown={e => { if (e.key === 'Enter') localizar(); }}
                placeholder="Rua, número, bairro e cidade"
                className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--tint-04)', border: '1px solid var(--tint-08)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={localizar} disabled={buscando || !texto.trim()}
                title="Localizar no mapa"
                className="px-3.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' }}
              >
                {buscando
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Navigation className="w-4 h-4" />}
              </button>
            </div>

            {erro && (
              <p className="text-xs flex items-start gap-1.5" style={{ color: '#fca5a5' }}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {erro}
              </p>
            )}

            {coord && (
              <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--tint-04)' }}>
                <p className="text-xs flex items-start gap-1.5" style={{ color: '#22c55e' }}>
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span className="font-medium">{nomeAchado || 'Endereço localizado'}</span>
                </p>
                <p className="text-[11px] mt-1 pl-5" style={{ color: 'var(--tint-35)' }}>
                  Confira se é o lugar certo antes de salvar.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={salvar} disabled={salvando || !coord || !mudou}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' }}
              >
                {salvando ? 'Salvando…' : 'Salvar sede'}
              </button>

              {sede.endereco && (
                <button
                  onClick={limpar} disabled={salvando}
                  title="Remover a sede — a rota volta a começar no primeiro compromisso"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all hover:opacity-80"
                  style={{ color: 'var(--tint-45)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
              )}

              {salvo && !mudou && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}>
                  <Check className="w-3.5 h-3.5" /> Salvo
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
