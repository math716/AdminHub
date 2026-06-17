'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/**
 * Botão compacto pra alternar tema. Persiste localmente via next-themes
 * e dispara PATCH /api/users/me/theme pra sincronizar entre dispositivos.
 */
export function ThemeToggleButton() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className="inline-block w-9 h-9 rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
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
    } catch {
      // silencioso — preferência segue no localStorage
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-secondary)',
      }}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
