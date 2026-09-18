import type { C2SMessage, GameState } from '../types.ts';

interface FinishedProps {
  game: GameState;
  playerId: string;
  onSend: (msg: C2SMessage) => void;
  onLeave: () => void;
}

export function Finished({ game, playerId, onSend, onLeave }: FinishedProps) {
  const isHost = game.players.find((p) => p.id === playerId)?.isHost ?? false;
  const sorted = [...game.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = sorted[0];
  const tie = top ? sorted.filter((p) => p.score === top.score).length > 1 : false;

  return (
    <div className="screen finished">
      <div className="card center">
        <h2 className="section-title">¡Partida terminada!</h2>
        {top && (
          <p className="winner">
            {tie ? '¡Empate entre' : 'Gana'}{' '}
            <strong>
              {tie
                ? sorted
                    .filter((p) => p.score === top.score)
                    .map((p) => p.name)
                    .join(' y ')
                : top.name}
            </strong>{' '}
            con {top.score} puntos
          </p>
        )}

        <ul className="scores">
          {sorted.map((p, i) => (
            <li key={p.id} className={`score-row ${i === 0 && !tie ? 'winner-row' : ''} ${p.id === playerId ? 'me' : ''}`}>
              <span className="score-pos">{i + 1}º</span>
              <span className="score-name">
                {p.name}
                {p.id === playerId && <em> (tú)</em>}
              </span>
              <span className="score-pts">{p.score}</span>
            </li>
          ))}
        </ul>

        <div className="lobby-actions center-actions">
          {isHost && (
            <button className="btn btn-primary" onClick={() => onSend({ t: 'restart' })}>
              Jugar otra vez
            </button>
          )}
          <button className="btn btn-ghost" onClick={onLeave}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
