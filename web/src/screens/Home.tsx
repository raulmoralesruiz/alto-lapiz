import { useState } from 'react';
import type { GameSettings } from '../types.ts';
import { MAX_NAME_LEN } from '../types.ts';

interface HomeProps {
  onCreate: (name: string, settings?: Partial<GameSettings>) => void;
  onJoin: (code: string, name: string) => void;
  connected: boolean;
  error: string | null;
  clearError: () => void;
}

export function Home({ onCreate, onJoin, connected, error, clearError }: HomeProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && connected;
  const canJoin = trimmedName.length > 0 && code.trim().length >= 4 && connected;

  const submit = () => {
    if (mode === 'create' && canCreate) onCreate(trimmedName);
    else if (mode === 'join' && canJoin) onJoin(code.trim(), trimmedName);
  };

  return (
    <div className="screen home">
      <div className="home-hero">
        <div className="home-logo">✎</div>
        <h1>Alto el Lápiz</h1>
        <p className="home-sub">El clásico juego de palabras, validado por IA local.</p>
      </div>

      <div className="card home-card">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'create'}
            className={`tab ${mode === 'create' ? 'active' : ''}`}
            onClick={() => {
              setMode('create');
              clearError();
            }}
          >
            Crear partida
          </button>
          <button
            role="tab"
            aria-selected={mode === 'join'}
            className={`tab ${mode === 'join' ? 'active' : ''}`}
            onClick={() => {
              setMode('join');
              clearError();
            }}
          >
            Unirse
          </button>
        </div>

        <label className="field">
          <span>Tu nombre</span>
          <input
            className="input"
            value={name}
            maxLength={MAX_NAME_LEN}
            placeholder="Ej. Ana"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>

        {mode === 'join' && (
          <label className="field">
            <span>Código de la partida</span>
            <input
              className="input input-code"
              value={code}
              placeholder="ABC123"
              maxLength={8}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
        )}

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
            <button className="banner-x" onClick={clearError} aria-label="Cerrar">
              ×
            </button>
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          disabled={mode === 'create' ? !canCreate : !canJoin}
          onClick={submit}
        >
          {mode === 'create' ? 'Crear partida' : 'Unirse a la partida'}
        </button>

        {!connected && <p className="hint">Conectando con el servidor…</p>}
      </div>
    </div>
  );
}
