import type { C2SMessage, GameState } from '../types.ts';

interface LobbyProps {
  game: GameState;
  playerId: string;
  onSend: (msg: C2SMessage) => void;
  onLeave: () => void;
}

export function Lobby({ game, playerId, onSend, onLeave }: LobbyProps) {
  const isHost = game.players.find((p) => p.id === playerId)?.isHost ?? false;
  const sorted = [...game.players].sort((a, b) => Number(b.isHost) - Number(a.isHost));

  return (
    <div className="screen lobby">
      <div className="card">
        <div className="lobby-code">
          <span className="lobby-code-label">Comparte este código</span>
          <span className="lobby-code-value">{game.code}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(game.code).catch(() => undefined);
            }}
          >
            Copiar
          </button>
        </div>

        <h2 className="section-title">Jugadores</h2>
        <ul className="players">
          {sorted.map((p) => (
            <li key={p.id} className={`player ${p.id === playerId ? 'me' : ''}`}>
              <span className={`dot ${p.connected ? 'on' : 'off'}`} title={p.connected ? 'Conectado' : 'Desconectado'} />
              <span className="player-name">
                {p.name}
                {p.id === playerId && <em> (tú)</em>}
              </span>
              {p.isHost && <span className="badge badge-host">Anfitrión</span>}
            </li>
          ))}
        </ul>

        <div className="lobby-actions">
          {isHost ? (
            <button className="btn btn-primary" onClick={() => onSend({ t: 'open_config' })}>
              Configurar y empezar
            </button>
          ) : (
            <p className="hint">Esperando a que el anfitrión configure la partida…</p>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            Salir de la partida
          </button>
        </div>
      </div>
    </div>
  );
}
