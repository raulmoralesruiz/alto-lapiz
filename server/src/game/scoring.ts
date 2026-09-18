import type { AnswerState, GameSettings } from '../../../shared/src/types.ts';
import { duplicateKey } from './normalize.ts';

/**
 * Calcula los puntos de cada respuesta de una ronda.
 * - válida y única  -> pointsUnique
 * - válida y repetida (misma respuesta normalizada de otro jugador) -> pointsShared
 * - inválida / dudosa / en disputa / vacía -> 0
 *
 * Función pura: no muta nada, devuelve un mapa answerId -> puntos.
 */
export function computeRoundPoints(answers: AnswerState[], settings: GameSettings): Map<string, number> {
  const points = new Map<string, number>();
  const byCategory = new Map<string, AnswerState[]>();
  for (const a of answers) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }
  for (const list of byCategory.values()) {
    const valid = list.filter((a) => a.status === 'valid');
    const counts = new Map<string, number>();
    for (const a of valid) {
      const k = duplicateKey(a.normalized);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const a of list) {
      if (a.status !== 'valid') {
        points.set(a.id, 0);
        continue;
      }
      const count = counts.get(duplicateKey(a.normalized)) ?? 1;
      points.set(a.id, count === 1 ? settings.pointsUnique : settings.pointsShared);
    }
  }
  return points;
}
