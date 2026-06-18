'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/**
 * Botão compacto pra alternar tema. Atualiza:
 *   1. localStorage (next-themes)
 *   2. DB (PATCH /api/users/me/theme)
 *   3. JWT da sessão (useSession.update) — necessário pra evitar que o JWT
 *      cacheado sobrescreva o tema no próximo reload/tab.
 */
export function ThemeToggleButton() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { update } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className="inline-block w-9 h-9 rounded-lg"
        style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.10)' }}
      />
    );
  }

  const current = (theme === 'system' ? resolvedTheme : theme) ?? 'dark';
  const isDark = current === 'dark';

  const toggle = async () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    try {
      await fetch('/api/users/me/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      // Refresca o JWT pra próxima session/tab abrir com o tema correto
      await update();
    } catch {
      // silencioso — preferência segue no localStorage
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors flex-shrink-0"
      style={{
        background: 'var(--tint-04)',
        border: '1px solid rgba(148,163,184,0.10)',
        color: '#CBD5E1',
      }}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
