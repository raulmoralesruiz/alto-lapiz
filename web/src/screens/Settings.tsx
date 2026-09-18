import { useState } from 'react';
import type { C2SMessage, GameSettings, GameState, Language } from '../types.ts';
import {
  DEFAULT_CATEGORIES,
  LANGUAGES,
  LANGUAGE_NAMES,
  MAX_CATEGORIES,
  MAX_CATEGORY_LEN,
  MAX_ROUNDS,
  MAX_TIME_LIMIT,
  MIN_CATEGORIES,
  MIN_TIME_LIMIT,
} from '../types.ts';

interface SettingsProps {
  game: GameState;
  onSend: (msg: C2SMessage) => void;
  onLeave: () => void;
}

export function Settings({ game, onSend, onLeave }: SettingsProps) {
  const [settings, setSettings] = useState<GameSettings>({
    ...game.settings,
    categories: [...game.settings.categories],
  });
  const [newCat, setNewCat] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const addCategory = () => {
    const c = newCat.trim();
    if (!c) return;
    if (c.length > MAX_CATEGORY_LEN) {
      setLocalError(`La categoría no puede superar ${MAX_CATEGORY_LEN} caracteres`);
      return;
    }
    if (settings.categories.length >= MAX_CATEGORIES) {
      setLocalError(`Máximo ${MAX_CATEGORIES} categorías`);
      return;
    }
    if (settings.categories.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setLocalError('Esa categoría ya existe');
      return;
    }
    setLocalError(null);
    set('categories', [...settings.categories, c]);
    setNewCat('');
  };

  const removeCategory = (idx: number) => {
    const next = settings.categories.filter((_, i) => i !== idx);
    if (next.length < MIN_CATEGORIES) {
      setLocalError(`Se requieren al menos ${MIN_CATEGORIES} categorías`);
      return;
    }
    setLocalError(null);
    set('categories', next);
  };

  const changeLanguage = (lang: Language) => {
    setLocalError(null);
    setSettings((s) => ({
      ...s,
      language: lang,
      categories: DEFAULT_CATEGORIES[lang],
    }));
  };

  const start = () => {
    if (settings.categories.length < MIN_CATEGORIES) {
      setLocalError(`Se requieren al menos ${MIN_CATEGORIES} categorías`);
      return;
    }
    onSend({ t: 'update_settings', settings });
    onSend({ t: 'start' });
  };

  return (
    <div className="screen settings">
      <div className="card">
        <h2 className="section-title">Configuración de la partida</h2>

        <div className="field">
          <span>Idioma</span>
          <select
            className="select"
            value={settings.language}
            onChange={(e) => changeLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span>Categorías ({settings.categories.length}/{MAX_CATEGORIES})</span>
          <ul className="categories">
            {settings.categories.map((c, i) => (
              <li key={`${c}-${i}`} className="category">
                <span>{c}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeCategory(i)}
                  disabled={settings.categories.length <= MIN_CATEGORIES}
                  aria-label={`Eliminar ${c}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="category-add">
            <input
              className="input"
              value={newCat}
              maxLength={MAX_CATEGORY_LEN}
              placeholder="Añadir categoría…"
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <button className="btn btn-ghost" onClick={addCategory} disabled={settings.categories.length >= MAX_CATEGORIES}>
              Añadir
            </button>
          </div>
        </div>

        <div className="settings-grid">
          <div className="field">
            <span>Rondas</span>
            <input
              className="input"
              type="number"
              min={1}
              max={MAX_ROUNDS}
              value={settings.rounds}
              onChange={(e) => set('rounds', clampInt(e.target.value, 1, MAX_ROUNDS))}
            />
          </div>
          <div className="field">
            <span>Tiempo (segundos)</span>
            <input
              className="input"
              type="number"
              min={MIN_TIME_LIMIT}
              max={MAX_TIME_LIMIT}
              value={settings.timeLimit}
              onChange={(e) => set('timeLimit', clampInt(e.target.value, MIN_TIME_LIMIT, MAX_TIME_LIMIT))}
            />
          </div>
          <div className="field">
            <span>Puntos (respuesta única)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={settings.pointsUnique}
              onChange={(e) => set('pointsUnique', clampInt(e.target.value, 0, 100))}
            />
          </div>
          <div className="field">
            <span>Puntos (respuesta repetida)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={settings.pointsShared}
              onChange={(e) => set('pointsShared', clampInt(e.target.value, 0, 100))}
            />
          </div>
        </div>

        {localError && (
          <div className="banner banner-error" role="alert">
            {localError}
            <button className="banner-x" onClick={() => setLocalError(null)} aria-label="Cerrar">
              ×
            </button>
          </div>
        )}

        <div className="lobby-actions">
          <button className="btn btn-primary" onClick={start}>
            Empezar partida
          </button>
          <button className="btn btn-ghost" onClick={() => onSend({ t: 'close_config' })}>
            Volver al lobby
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
