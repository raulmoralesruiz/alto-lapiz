import { useEffect, useRef, useState } from 'react';
import type { C2SMessage, GameState } from '../types.ts';
import { MAX_ANSWER_LEN } from '../types.ts';
import { useNow } from '../useCountdown.ts';

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

  if (game.phase === 'round_start') {
    return (
      <RoundStart
        letter={round.letter}
        votes={round.letterVotes.length}
        players={game.players.length}
        voted={round.letterVotes.includes(playerId)}
        startedAt={round.startedAt}
        revealMs={round.revealMs}
        skewMs={skewMs}
        onVote={() => onSend({ t: 'vote_letter' })}
      />
    );
  }
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
      onSend={onSend}
      onLeave={onLeave}
    />
  );
}

const SPIN_MS = 1200;
const SPIN_TICK_MS = 80;
const randomSpinLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

function RoundStart({
  letter,
  votes,
  players,
  voted,
  startedAt,
  revealMs,
  skewMs,
  onVote,
}: {
  letter: string;
  votes: number;
  players: number;
  voted: boolean;
  startedAt: number;
  revealMs: number;
  skewMs: number;
  onVote: () => void;
}) {
  const needed = Math.floor(players / 2) + 1;
  const deadline = startedAt + revealMs;
  const serverNow = useNow(true, skewMs, 100);
  const remainingMs = Math.max(0, deadline - serverNow);
  const seconds = Math.ceil(remainingMs / 1000);
  const progress = revealMs > 0 ? Math.min(1, Math.max(0, remainingMs / revealMs)) : 0;

  const [display, setDisplay] = useState(randomSpinLetter);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(letter);
      setLanded(true);
      return;
    }
    setLanded(false);
    const start = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - start >= SPIN_MS) {
        window.clearInterval(id);
        setDisplay(letter);
        setLanded(true);
      } else {
        setDisplay(randomSpinLetter());
      }
    }, SPIN_TICK_MS);
    return () => window.clearInterval(id);
  }, [letter]);

  return (
    <div className="screen game reveal">
      <div className="card center reveal-card">
        <p className="reveal-label">Preparados… la letra es</p>
        <div className={`letter ${landed ? 'landed' : 'spinning'}`}>{display}</div>
        <div className="countdown" aria-live="polite">
          <span className="countdown-num">{seconds}</span>
          <span className="countdown-label">empieza en</span>
        </div>
        <div className="countdown-bar" aria-hidden>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="hint">¡A escribir cuando empiece el cronómetro!</p>
        <button className="btn btn-ghost" onClick={onVote} disabled={voted}>
          {voted ? `Votado (${votes}/${needed})` : `Cambiar letra (${votes}/${needed})`}
        </button>
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

function Playing({ game, playerId, onSend, onLeave }: Omit<GameProps, 'skewMs'>) {
  const round = game.round;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (round) for (const c of round.categories) init[c] = round.letter;
    return init;
  });
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

  if (!round) return null;

  return (
    <div className="screen game">
      <div className="card answers">
        {round.categories.map((category) => (
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
