'use client';

// Guarda uma "foto" (dataURL) da Gabi 3D capturada do canvas, para reusar como
// avatar nas mensagens do chat sem criar um WebGL por mensagem. Módulo puro
// (não importa three), para não pesar o bundle de quem só lê a foto.

let face: string | null = null;
const subs = new Set<() => void>();

export function setGabiFace(url: string | null) {
  if (url && url.length > 100 && url !== face) {
    face = url;
    subs.forEach(f => f());
  }
}
export function getGabiFace() { return face; }
export function subscribeGabiFace(cb: () => void) {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
