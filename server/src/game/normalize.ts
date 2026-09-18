/** Normaliza una respuesta para comparación y almacenamiento. */
export function normalizeAnswer(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Clave para detectar duplicados: insensible a mayúsculas, espacios
 * y acentos. "París" y "paris" son el mismo intento.
 */
export function duplicateKey(normalized: string): string {
  return normalized.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
