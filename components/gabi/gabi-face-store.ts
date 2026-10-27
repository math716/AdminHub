'use client';

// Guarda uma "foto" (dataURL) da Gabi 3D capturada do canvas, para reusar como
// avatar nas mensagens do chat sem criar um WebGL por mensagem. Módulo puro
// (não importa three), para não pesar o bundle de quem só lê a foto.
//
// O retrato (a foto do avatar grande) também fica no localStorage, para os
// avatares das mensagens já terem a foto antes de o 3D carregar. (Não é
// mostrado no lugar do 3D: a troca foto → 3D ficava visível.)

// Modelo 3D da Gabi. Vem do próprio sistema (public/models/gabi.glb);
// pode ser sobrescrito por NEXT_PUBLIC_GABI_MODEL_URL (ex.: uma URL hospedada).
export const GABI_MODEL_URL = process.env.NEXT_PUBLIC_GABI_MODEL_URL || '/models/gabi.glb';

const CHAVE_RETRATO = 'gabi-retrato';

let face: string | null = null;
let retrato: string | null | undefined; // undefined = ainda não lido
const subs = new Set<() => void>();

/** Retrato salvo deste modelo (ou null). Trocar o modelo invalida a foto. */
export function getGabiRetrato(): string | null {
  if (retrato !== undefined) return retrato;
  let lido: string | null = null;
  try {
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_RETRATO) ?? 'null');
    if (salvo?.modelo === GABI_MODEL_URL && typeof salvo.img === 'string') lido = salvo.img;
  } catch {}
  retrato = lido;
  return lido;
}

export function salvarGabiRetrato(url: string) {
  if (!url || url.length < 100) return;
  retrato = url;
  try { window.localStorage.setItem(CHAVE_RETRATO, JSON.stringify({ modelo: GABI_MODEL_URL, img: url })); } catch {}
}

export function setGabiFace(url: string | null) {
  if (url && url.length > 100 && url !== face) {
    face = url;
    subs.forEach(f => f());
  }
}
export function getGabiFace() {
  if (face) return face;
  return typeof window === 'undefined' ? null : getGabiRetrato();
}
export function subscribeGabiFace(cb: () => void) {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
