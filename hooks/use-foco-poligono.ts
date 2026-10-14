'use client';

// Busca de bairro nos mapas de polígonos (SP distritos, RJ, Fortaleza, DF,
// bairros IBGE genéricos).
//
// Esses mapas destacavam o bairro selecionado, mas não aproximavam: escolher
// um bairro pela busca deixava o mapa na cidade inteira. Este hook faz as duas
// pontas que faltavam, iguais nos cinco mapas:
// - informa à tela os nomes dos polígonos carregados (a busca lista todos,
//   inclusive os sem voto — a lista lateral só tem os que têm);
// - aproxima no polígono pedido. O pedido carrega um `nonce`, como o foco de
//   zona: escolher de novo o mesmo bairro aproxima de novo.

import { useEffect, type MutableRefObject } from 'react';

export interface PedidoFocoBairro {
  nome: string;
  nonce: number;
}

/** Sem acento, maiúsculo e sem pontuação — o mesmo critério dos mapas. */
export function normalizarNomeBairro(nome: string): string {
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useFocoPoligono(opcoes: {
  mapInstanceRef: MutableRefObject<any>;
  geoLayerRef: MutableRefObject<any>;
  features: any[] | null | undefined;
  nomeDe: (feature: any) => string;
  foco?: PedidoFocoBairro | null;
  onNomes?: (nomes: string[]) => void;
}) {
  const { mapInstanceRef, geoLayerRef, features, nomeDe, foco, onNomes } = opcoes;

  useEffect(() => {
    if (!onNomes || !features) return;
    const nomes = [...new Set(features.map(f => nomeDe(f)).filter(Boolean))];
    onNomes(nomes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  useEffect(() => {
    if (!foco) return;
    let cancelado = false;
    const alvo = normalizarNomeBairro(foco.nome);
    // O mapa monta de forma assíncrona: se o pedido chegar antes, tenta de novo
    // por alguns instantes em vez de perder o foco.
    const tentar = (n: number) => {
      if (cancelado) return;
      const map = mapInstanceRef.current;
      const geo = geoLayerRef.current;
      if (!map || !geo) {
        if (n < 40) setTimeout(() => tentar(n + 1), 150);
        return;
      }
      let camada: any = null;
      geo.eachLayer((l: any) => {
        if (!camada && normalizarNomeBairro(nomeDe(l.feature)) === alvo) camada = l;
      });
      const limites = camada?.getBounds?.();
      if (limites?.isValid?.()) {
        map.fitBounds(limites, { padding: [40, 40], maxZoom: 15, animate: true });
      }
    };
    tentar(0);
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.nonce]);
}
