import type { AiStatus } from '../types.ts';
import { formatSeconds, useCountdown } from '../useCountdown.ts';

interface HeaderProps {
  code: string | null;
  connected: boolean;
  aiStatus: AiStatus | null;
  roundLetter?: string | null;
  roundEndsAt?: number | null;
  skewMs?: number;
  compact?: boolean;
  timerTitle?: string;
  onLeave?: () => void;
}

export function Header({ code, connected, aiStatus, roundLetter, roundEndsAt, skewMs = 0, compact = false, timerTitle = 'Tiempo restante', onLeave }: HeaderProps) {
  const unknown = aiStatus === null || aiStatus.available === null;
  const aiDot = unknown ? 'unknown' : aiStatus.available ? 'ok' : 'down';
  const aiLabel = unknown
    ? 'IA: desconocido'
    : aiStatus.available
      ? `IA: ${aiStatus.model ?? 'disponible'}`
      : 'IA no disponible';

  const showTimer = roundEndsAt !== null && roundEndsAt !== undefined;
  const remaining = useCountdown(showTimer ? roundEndsAt : null, skewMs, showTimer);
  const urgent = showTimer && remaining <= 10;

  return (
    <header className={compact ? 'header header--compact' : 'header'}>
      <div className="header-brand">
        <span className="brand-mark">✎</span>
        <span className="brand-name">Alto el Lápiz</span>
      </div>
      <div className="header-status">
        {roundLetter && (
          <span className="badge badge-letter" title="Letra de la ronda">
            {roundLetter}
          </span>
        )}
        {showTimer && (
          <span className={`badge badge-timer ${urgent ? 'urgent' : ''}`} title={timerTitle}>
            {formatSeconds(remaining)}
          </span>
        )}
        {!compact && code && <span className="badge badge-code" title="Código de la partida">#{code}</span>}
        {!compact && (
          <span className={`badge badge-ai ${aiDot}`} title={aiStatus?.error ?? aiLabel}>
            {aiLabel}
          </span>
        )}
        {!compact && (
          <span className={`badge badge-net ${connected ? 'ok' : 'down'}`}>{connected ? 'En línea' : 'Sin conexión'}</span>
        )}
      </div>
      {onLeave && (
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          Salir
        </button>
      )}
    </header>
  );
}
