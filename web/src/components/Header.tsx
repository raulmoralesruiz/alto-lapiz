import type { AiStatus } from '../types.ts';

interface HeaderProps {
  code: string | null;
  connected: boolean;
  aiStatus: AiStatus | null;
  onLeave?: () => void;
}

export function Header({ code, connected, aiStatus, onLeave }: HeaderProps) {
  const unknown = aiStatus === null || aiStatus.available === null;
  const aiDot = unknown ? 'unknown' : aiStatus.available ? 'ok' : 'down';
  const aiLabel = unknown
    ? 'IA: desconocido'
    : aiStatus.available
      ? `IA: ${aiStatus.model ?? 'disponible'}`
      : 'IA no disponible';
  return (
    <header className="header">
      <div className="header-brand">
        <span className="brand-mark">✎</span>
        <span className="brand-name">Alto el Lápiz</span>
      </div>
      <div className="header-status">
        {code && <span className="badge badge-code" title="Código de la partida">#{code}</span>}
        <span className={`badge badge-ai ${aiDot}`} title={aiStatus?.error ?? aiLabel}>
          {aiLabel}
        </span>
        <span className={`badge badge-net ${connected ? 'ok' : 'down'}`}>{connected ? 'En línea' : 'Sin conexión'}</span>
      </div>
      {onLeave && (
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          Salir
        </button>
      )}
    </header>
  );
}
