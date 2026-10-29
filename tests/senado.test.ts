// A bancada do Senado em exercício troca sozinha na posse (1º de fevereiro).

import { describe, it, expect } from 'vitest';
import { anosDoSenadoEmExercicio, eleicaoAguardandoPosse, vagasNaEleicao } from '@/lib/agent/senado';

const em = (iso: string) => new Date(iso);

describe('Senado em exercício', () => {
  it('até 31/01/2027: 2018 + 2022, com 2026 aguardando posse', () => {
    expect(anosDoSenadoEmExercicio(em('2026-10-29T12:00:00-03:00'))).toEqual([2018, 2022]);
    expect(anosDoSenadoEmExercicio(em('2027-01-31T23:59:00-03:00'))).toEqual([2018, 2022]);
    expect(eleicaoAguardandoPosse(em('2026-10-29T12:00:00-03:00'))).toBe(2026);
  });

  it('a partir de 1º/02/2027: 2022 + 2026, sem eleição aguardando', () => {
    expect(anosDoSenadoEmExercicio(em('2027-02-01T00:00:00-03:00'))).toEqual([2022, 2026]);
    expect(anosDoSenadoEmExercicio(em('2029-06-01T00:00:00-03:00'))).toEqual([2022, 2026]);
    expect(eleicaoAguardandoPosse(em('2027-02-01T00:00:00-03:00'))).toBeNull();
  });

  it('antes da eleição de 2026 (ex.: jun/2026) ninguém aguarda posse', () => {
    expect(anosDoSenadoEmExercicio(em('2026-06-01T00:00:00-03:00'))).toEqual([2018, 2022]);
    expect(eleicaoAguardandoPosse(em('2026-06-01T00:00:00-03:00'))).toBeNull();
  });

  it('vagas alternadas: 2018 e 2026 elegem 2; 2022 e 2030 elegem 1', () => {
    expect([2018, 2022, 2026, 2030].map(vagasNaEleicao)).toEqual([2, 1, 2, 1]);
  });
});
