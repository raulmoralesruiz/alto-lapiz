import { useGame } from './useGame.ts';
import { Header } from './components/Header.tsx';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Settings } from './screens/Settings.tsx';
import { Game } from './screens/Game.tsx';
import { Results } from './screens/Results.tsx';
import { Finished } from './screens/Finished.tsx';

export default function App() {
  const api = useGame();
  const { game, playerId } = api;

  if (!game || !playerId) {
    return (
      <div className="app">
        <Home
          onCreate={api.create}
          onJoin={api.join}
          connected={api.connected}
          error={api.error}
          clearError={api.clearError}
        />
      </div>
    );
  }

  const inGame = game.phase !== 'lobby' && game.phase !== 'configuring';
  const header = (
    <Header code={game.code} connected={api.connected} aiStatus={api.aiStatus} onLeave={api.leave} />
  );

  let screen;
  switch (game.phase) {
    case 'lobby':
      screen = <Lobby game={game} playerId={playerId} onSend={api.send} onLeave={api.leave} />;
      break;
    case 'configuring':
      screen = <Settings game={game} onSend={api.send} onLeave={api.leave} />;
      break;
    case 'round_start':
    case 'playing':
    case 'validating':
      screen = <Game game={game} playerId={playerId} skewMs={api.skewMs} onSend={api.send} onLeave={api.leave} />;
      break;
    case 'results':
      screen = <Results game={game} playerId={playerId} onSend={api.send} onLeave={api.leave} />;
      break;
    case 'finished':
      screen = <Finished game={game} playerId={playerId} onSend={api.send} onLeave={api.leave} />;
      break;
    default:
      screen = (
        <div className="screen">
          <div className="card center">
            <p className="hint">Fase desconocida</p>
          </div>
        </div>
      );
  }

  return (
    <div className="app">
      {header}
      {inGame && api.error && (
        <div className="banner banner-error app-banner" role="alert">
          {api.error}
          <button className="banner-x" onClick={api.clearError} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}
      {screen}
    </div>
  );
}
