import { useEffect, useRef, useState } from 'react';
import type { C2SMessage, GameState } from '../types.ts';
import { MAX_ANSWER_LEN } from '../types.ts';
import { formatSeconds, useCountdown } from '../useCountdown.ts';

interface GameProps {
  game: GameState;
  playerId: string;
  skewMs: number;
  onSend: (msg: C2SMessage) => void;
  onLeave: () => void;
}

export function Game({ game, playerId, skewMs, onSend, onLeave }: GameProps) {
  const round = game.round;
  if (!round) {
    return (
      <div className="screen">
        <div className="card center">
          <p className="hint">Cargando ronda…</p>
        </div>
      </div>
    );
  }

  if (game.phase === 'round_start') return <RoundStart letter={round.letter} />;
  if (game.phase === 'validating') return <Validating onLeave={onLeave} />;
  if (game.phase !== 'playing') {
    return (
      <div className="screen">
        <div className="card center">
          <p className="hint">Esperando…</p>
        </div>
      </div>
    );
  }

  return (
    <Playing
      game={game}
      playerId={playerId}
      skewMs={skewMs}
      onSend={onSend}
      onLeave={onLeave}
    />
  );
}

function RoundStart({ letter }: { letter: string }) {
  return (
    <div className="screen game reveal">
      <div className="card center reveal-card">
        <p className="reveal-label">Preparados… la letra es</p>
        <div className="letter">{letter}</div>
        <p className="hint">¡A escribir cuando empiece el cronómetro!</p>
      </div>
    </div>
  );
}

function Validating({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="screen game">
      <div className="card center">
        <div className="spinner" aria-hidden />
        <h2>La IA está validando las respuestas…</h2>
        <p className="hint">Esto puede tardar unos segundos.</p>
        <button className="btn btn-ghost" onClick={onLeave}>
          Salir
        </button>
      </div>
    </div>
  );
}

function Playing({ game, playerId, skewMs, onSend, onLeave }: GameProps) {
  const round = game.round;
  const remaining = useCountdown(round?.endsAt ?? null, skewMs, true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pendingRef = useRef<Record<string, number>>({});
  const [pencilDown, setPencilDown] = useState(false);

  const myAnswer = (category: string) =>
    round?.answers.find((a) => a.playerId === playerId && a.category === category)?.raw ?? '';

  const scheduleSend = (category: string, text: string) => {
    const existing = pendingRef.current[category];
    if (existing) window.clearTimeout(existing);
    pendingRef.current[category] = window.setTimeout(() => {
      delete pendingRef.current[category];
      onSend({ t: 'answer', category, text: text.slice(0, MAX_ANSWER_LEN) });
    }, 350);
  };

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      for (const k of Object.keys(pending)) window.clearTimeout(pending[k]);
    };
  }, []);

  const stop = () => {
    setPencilDown(true);
    onSend({ t: 'pencil_down' });
  };

  const urgent = remaining <= 10;

  return (
    <div className="screen game">
      <div className="game-top">
        <div className="letter small">{round?.letter}</div>
        <div className={`timer ${urgent ? 'urgent' : ''}`}>{formatSeconds(remaining)}</div>
      </div>

      <div className="card answers">
        {game.settings.categories.map((category) => (
          <label key={category} className="answer-row">
            <span className="answer-cat">{category}</span>
            <input
              className="input"
              value={answers[category] ?? myAnswer(category)}
              maxLength={MAX_ANSWER_LEN}
              placeholder={`Escribe una ${category.toLowerCase()}…`}
              disabled={pencilDown}
              onChange={(e) => {
                const v = e.target.value;
                setAnswers((a) => ({ ...a, [category]: v }));
                scheduleSend(category, v);
              }}
            />
          </label>
        ))}
      </div>

      <div className="game-actions">
        <button className="btn btn-danger btn-block" onClick={stop} disabled={pencilDown}>
          {pencilDown ? 'Lápiz abajo…' : '¡Alto el lápiz!'}
        </button>
        <button className="btn btn-ghost" onClick={onLeave}>
          Salir
        </button>
      </div>
    </div>
  );
}
