import { useEffect, useState } from 'react';
import GameSelection from './pages/GameSelection.jsx';
import AuctionGame from './pages/AuctionGame.jsx';
import PlayerCareerGame from './pages/PlayerCareerGame.jsx';

export function routeFromHash(hash) {
  if (hash === '#/encheres') return 'auction';
  if (hash === '#/parcours') return 'career';
  return 'home';
}

export default function App() {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const navigate = () => {
      setRoute(routeFromHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  if (route === 'auction') return <AuctionGame />;
  if (route === 'career') return <PlayerCareerGame />;
  return <GameSelection />;
}
