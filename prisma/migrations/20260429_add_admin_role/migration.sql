-- Adiciona valor ADMIN ao enum UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
