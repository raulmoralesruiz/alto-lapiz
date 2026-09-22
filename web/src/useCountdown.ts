import { useEffect, useState } from 'react';

/**
 * Devuelve la hora actual compensada con la diferencia de reloj del
 * servidor (skewMs). Tick cada `intervalMs` mientras `active` sea true.
 */
export function useNow(active: boolean, skewMs: number, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now + skewMs;
}

/**
 * Devuelve los segundos restantes hasta `endsAt`, compensando la
 * diferencia de reloj con el servidor (skewMs). Tick cada 200ms.
 */
export function useCountdown(endsAt: number | null, skewMs: number, active: boolean): number {
  const serverNow = useNow(active && endsAt !== null, skewMs);
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000));
}

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
