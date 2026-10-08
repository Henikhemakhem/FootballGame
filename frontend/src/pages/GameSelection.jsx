import { ArrowRight, Brain, Gavel, Gift, Route, Users } from 'lucide-react';
import { GameNavigation, PlatformFooter } from '../components/GameNavigation.jsx';

export default function GameSelection() {
  return <div className="app-shell">
    <GameNavigation />
    <main className="selection-page">
      <div className="selection-intro"><span className="eyebrow"><span className="live-dot" /> LE TERRAIN EST À VOUS</span><h1>Deux jeux.<br /><span>La même passion.</span></h1><p>Construisez votre équipe ou mettez votre mémoire à l’épreuve.<br />Choisissez votre jeu et entrez sur le terrain.</p></div>
      <div className="game-selection-grid">
        <a className="game-choice auction-choice" href="#/encheres">
          <div className="choice-visual" aria-hidden="true"><span className="choice-number">01</span><Gavel size={74} /><span className="choice-word">DRAFT</span></div>
          <div className="choice-content"><span className="section-kicker">LE MERCATO SE JOUE À DEUX</span><h2>Jeu des enchères</h2><p>Un budget de $200. Six manches pour bâtir votre équipe. Remportez les enchères ou découvrez vos recrues gratuites.</p><div className="choice-meta"><span><Users size={15} /> 2 joueurs</span><span><Gift size={15} /> 6 recrues chacun</span></div><span className="choice-play">Jouer aux enchères <ArrowRight size={19} /></span></div>
        </a>
        <a className="game-choice career-choice" href="#/parcours">
          <div className="choice-visual" aria-hidden="true"><span className="choice-number">02</span><Route size={74} /><span className="choice-word">QUIZ</span></div>
          <div className="choice-content"><span className="section-kicker">LES CLUBS RACONTENT UNE HISTOIRE</span><h2>Parcours du joueur</h2><p>Des clubs, des dates et un joueur à retrouver. Suivez son parcours professionnel : vous n’avez qu’une tentative.</p><div className="choice-meta"><span><Brain size={15} /> En solo</span><span><Route size={15} /> 3 difficultés</span></div><span className="choice-play">Deviner le joueur <ArrowRight size={19} /></span></div>
        </a>
      </div>
      <p className="selection-note">Vos parties sont sauvegardées séparément. Retrouvez-les en revenant au jeu.</p>
    </main>
    <PlatformFooter />
  </div>;
}
