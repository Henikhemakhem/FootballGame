import { Brain, Gavel, Goal, House } from 'lucide-react';

export function GameNavigation({ current = 'home', accessory }) {
  return <header className="site-header platform-header">
    <a className="brand" href="#/" aria-label="Football Games, accueil"><span className="brand-icon"><Goal size={23} /></span>FOOTBALL<span>GAMES</span><small>V1</small></a>
    <nav className="game-navigation" aria-label="Choisir un jeu">
      <a href="#/" aria-current={current === 'home' ? 'page' : undefined}><House size={15} /><span>Accueil</span></a>
      <a href="#/encheres" aria-current={current === 'auction' ? 'page' : undefined}><Gavel size={15} /><span>Enchères</span></a>
      <a href="#/parcours" aria-current={current === 'career' ? 'page' : undefined}><Brain size={15} /><span>Parcours du joueur</span></a>
    </nav>
    {accessory}
  </header>;
}

export function PlatformFooter() {
  return <footer><span>FOOTBALL GAMES</span><span>Le football, sous tous les angles.</span><span>À VOUS DE JOUER / V1</span></footer>;
}
