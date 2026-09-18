import { useEffect, useState } from 'react';

/**
 * Devuelve los segundos restantes hasta `endsAt`, compensando la
 * diferencia de reloj con el servidor (skewMs). Tick cada 200ms.
 */
export function useCountdown(endsAt: number | null, skewMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || endsAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [active, endsAt]);
  if (endsAt === null) return 0;
  const serverNow = now + skewMs;
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000));
}

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
