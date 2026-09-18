import type { AnswerState, C2SMessage, GameState } from '../types.ts';

interface ResultsProps {
  game: GameState;
  playerId: string;
  onSend: (msg: C2SMessage) => void;
  onLeave: () => void;
}

const STATUS_LABEL: Record<AnswerState['status'], string> = {
  pending: 'Pendiente',
  valid: 'Válida',
  invalid: 'Inválida',
  uncertain: 'Dudosa',
  disputed: 'En disputa',
};

export function Results({ game, playerId, onSend, onLeave }: ResultsProps) {
  const round = game.round;
  if (!round) return null;

  const isHost = game.players.find((p) => p.id === playerId)?.isHost ?? false;
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? 'Jugador';
  const isLastRound = round.index >= game.settings.rounds;

  const byCategory = game.settings.categories
    .map((cat) => ({ cat, answers: round.answers.filter((a) => a.category === cat) }))
    .filter((g) => g.answers.length > 0);

  return (
    <div className="screen results">
      <div className="card">
        <div className="results-head">
          <div>
            <h2 className="section-title">
              Ronda {round.index} de {game.settings.rounds}
            </h2>
            <p className="hint">Letra: {round.letter}</p>
          </div>
          <div className="results-head-actions">
            {isHost && (
              <button
                className="btn btn-primary"
                onClick={() => onSend({ t: 'next_round' })}
              >
                {isLastRound ? 'Ver resultado final' : 'Siguiente ronda'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={onLeave}>
              Salir
            </button>
          </div>
        </div>

        {byCategory.length === 0 && <p className="hint">Nadie respondió esta ronda.</p>}

        {byCategory.map(({ cat, answers }) => (
          <section key={cat} className="result-group">
            <h3 className="result-cat">{cat}</h3>
            <ul className="result-list">
              {answers.map((a) => (
                <li key={a.id} className={`result-row status-${a.status}`}>
                  <div className="result-main">
                    <span className="result-text">{a.raw || '—'}</span>
                    <span className="result-player">
                      {nameOf(a.playerId)}
                      {a.playerId === playerId && <em> (tú)</em>}
                    </span>
                    {a.reason && <span className="result-reason">{a.reason}</span>}
                  </div>
                  <div className="result-side">
                    <span className={`badge status-badge status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                    <span className="result-points">+{a.points}</span>
                    <div className="result-actions">
                      {a.status !== 'disputed' && a.status !== 'pending' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onSend({ t: 'dispute', answerId: a.id })}
                        >
                          Disputar
                        </button>
                      )}
                      {a.status === 'disputed' && (
                        <>
                          <button
                            className="btn btn-sm btn-ok"
                            onClick={() => onSend({ t: 'resolve', answerId: a.id, valid: true })}
                          >
                            Válida
                          </button>
                          <button
                            className="btn btn-sm btn-bad"
                            onClick={() => onSend({ t: 'resolve', answerId: a.id, valid: false })}
                          >
                            Inválida
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
