'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';

/**
 * Sincroniza o tema do servidor (User.theme) pro localStorage do next-themes
 * uma vez ao logar. Roda só quando session muda de unauthenticated → authenticated.
 *
 * Cobre o caso de o usuário ter trocado o tema em outro dispositivo.
 */
export function ThemeSync() {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (status !== 'authenticated') return;
    const serverTheme = (session?.user as any)?.theme;
    if (serverTheme === 'light' || serverTheme === 'dark') {
      setTheme(serverTheme);
    }
  }, [status, session, setTheme]);

  return null;
}
