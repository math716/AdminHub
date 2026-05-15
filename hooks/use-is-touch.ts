'use client';

import { useEffect, useState } from 'react';

/**
 * Versao sincrona para uso fora de componentes React (ex.: dentro de
 * useEffect imperativo que monta Leaflet, antes de bindar listeners).
 * Retorna o valor atual sem ser reativo a mudancas.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * Retorna true quando o dispositivo nao tem hover preciso (touch puro:
 * celular, tablet sem mouse). Reativo: muda se um mouse for plugado num
 * tablet/Windows tactil enquanto o app roda.
 *
 * Combinacao `(hover: none) and (pointer: coarse)` eh a recomendacao do
 * MDN/CSS Media Queries L4 para distinguir touch real de pointer fino.
 *
 * Default = false em SSR e antes do mount (assume desktop). Isso evita
 * que a UI "pisque" entre estados no primeiro paint em desktop, que eh
 * a maioria do trafego.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
    const update = () => setIsTouch(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);

  return isTouch;
}
