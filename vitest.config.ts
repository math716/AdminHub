// Testes automáticos (npm test). Rodam com dados simulados: nenhum teste
// acessa o banco real nem a internet.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Cada arquivo isolado: os mocks de um não vazam para o outro.
    isolate: true,
  },
});
