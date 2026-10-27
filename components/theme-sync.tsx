'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';

/**
 * Sincroniza User.theme (servidor) pro localStorage do next-themes.
 *
 * Roda **uma única vez por tab session** — depois disso o localStorage
 * é a fonte de verdade. O tema vem do banco (GET /api/users/me/theme), não
 * do JWT: trocar o tema não renova mais a sessão (a renovação punha a sessão
 * em 'loading' e desmontava as telas), então o JWT pode estar desatualizado.
 */
export function ThemeSync() {
  const { status } = useSession();
  const { setTheme } = useTheme();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    if (typeof window === 'undefined') return;
    if (status !== 'authenticated') return;
    syncedRef.current = true;

    // sessionStorage é por tab — sobrevive reload, morre ao fechar tab
    if (window.sessionStorage.getItem('theme-synced') === '1') return;

    fetch('/api/users/me/theme')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const serverTheme = d?.theme;
        if (serverTheme === 'light' || serverTheme === 'dark') {
          window.sessionStorage.setItem('theme-synced', '1');
          setTheme(serverTheme);
        }
      })
      .catch(() => {
        // silencioso — segue o tema do localStorage
      });
  }, [status, setTheme]);

  return null;
}
