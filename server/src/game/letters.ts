import { randomInt } from 'node:crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function randomLetter(exclude?: string): string {
  const pool = exclude ? LETTERS.split('').filter((l) => l !== exclude.toUpperCase()) : LETTERS.split('');
  const list = pool.length > 0 ? pool : LETTERS.split('');
  return list[randomInt(0, list.length)] ?? 'A';
}
