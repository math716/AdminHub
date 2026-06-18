'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';

/**
 * Sincroniza User.theme (servidor) pro localStorage do next-themes.
 *
 * Roda **uma única vez por tab session** — depois disso o localStorage
 * é a fonte de verdade, evitando que o JWT em cache sobrescreva a escolha
 * feita pelo usuário. Quando o usuário troca o tema, o handler chama
 * session.update(), que refresca o JWT pra próxima sessão começar correta.
 */
export function ThemeSync() {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    if (typeof window === 'undefined') return;
    if (status !== 'authenticated') return;

    // sessionStorage é por tab — sobrevive reload, morre ao fechar tab
    if (window.sessionStorage.getItem('theme-synced') === '1') {
      syncedRef.current = true;
      return;
    }

    const serverTheme = (session?.user as any)?.theme;
    if (serverTheme === 'light' || serverTheme === 'dark') {
      window.sessionStorage.setItem('theme-synced', '1');
      syncedRef.current = true;
      setTheme(serverTheme);
    }
  }, [status, session, setTheme]);

  return null;
}
