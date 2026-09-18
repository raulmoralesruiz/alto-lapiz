/**
 * Limpia texto de usuario: elimina caracteres de control y zero-width,
 * colapsa espacios y limita la longitud.
 */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2028-\u202f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLen);
}
