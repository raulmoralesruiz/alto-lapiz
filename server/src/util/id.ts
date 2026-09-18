import { randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newGameCode(length = 5): string {
  let out = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  }
  return out;
}
