// Criptografia dos tokens do Google guardados no banco.
//
// O refresh_token dá acesso à agenda da conta conectada e ficava em texto puro
// na tabela google_agenda_conexoes: quem lesse o banco (um backup, um acesso
// indevido) levava a agenda junto. Aqui ele é cifrado com AES-256-GCM, com a
// chave fora do banco — na variável de ambiente GOOGLE_TOKEN_KEY (32 bytes em
// base64), que precisa ser a MESMA nos dois deploys, porque os dois leem o
// mesmo banco.
//
// Convive com o que já está gravado: valor sem o prefixo "enc:v1:" é texto
// puro antigo e é lido como está. Sem a chave configurada, grava em texto puro
// como antes — o código pode subir antes de a chave existir.

import crypto from 'crypto';

const PREFIXO = 'enc:v1:';

function chave(): Buffer | null {
  const bruta = process.env.GOOGLE_TOKEN_KEY;
  if (!bruta) return null;
  const k = Buffer.from(bruta, 'base64');
  if (k.length !== 32) throw new Error('GOOGLE_TOKEN_KEY deve ter 32 bytes em base64.');
  return k;
}

export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

/** Cifra para gravar. Sem chave configurada, devolve o texto como está. */
export function cifrarToken(texto: string): string;
export function cifrarToken(texto: string | null | undefined): string | null;
export function cifrarToken(texto: string | null | undefined): string | null {
  if (texto == null || estaCifrado(texto)) return texto ?? null;
  const k = chave();
  if (!k) return texto;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

/** Decifra o que veio do banco. Texto puro antigo passa direto. */
export function decifrarToken(valor: string): string;
export function decifrarToken(valor: string | null | undefined): string | null;
export function decifrarToken(valor: string | null | undefined): string | null {
  if (valor == null || !estaCifrado(valor)) return valor ?? null;
  const k = chave();
  if (!k) throw new Error('Token do Google cifrado, mas GOOGLE_TOKEN_KEY não está configurada neste ambiente.');
  const dados = Buffer.from(valor.slice(PREFIXO.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k, dados.subarray(0, 12));
  d.setAuthTag(dados.subarray(12, 28));
  return Buffer.concat([d.update(dados.subarray(28)), d.final()]).toString('utf8');
}

/** Há chave configurada (e válida) neste ambiente? */
export function temChaveDeTokens(): boolean {
  return chave() !== null;
}
