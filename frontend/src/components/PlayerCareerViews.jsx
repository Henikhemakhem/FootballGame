import { ArrowRight, Brain, Check, Info, Route, X } from 'lucide-react';
import { CareerTimeline, DifficultyPicker, difficulties } from './CareerTimeline.jsx';
import { Portrait } from '../components.jsx';

export function CareerSetup({ difficulty, setDifficulty, busy, onStart }) {
  return <section className="career-setup">
    <span className="career-emblem"><Route size={42} /></span><h2>Reconnaissez-vous sa trajectoire ?</h2><p>Au moins trois clubs. Une seule réponse.<br />Le nom et la photo seront révélés après votre tentative.</p>
    <DifficultyPicker value={difficulty} onChange={setDifficulty} disabled={busy} />
    <button className="button primary" disabled={busy} onClick={onStart}>{busy ? 'Recherche d’un parcours…' : 'Nouvelle partie'}<ArrowRight size={18} /></button>
  </section>;
}

export function CareerRound({ game, answer, setAnswer, busy, onSubmit }) {
  return <section className="career-play">
    <div className="career-card-header"><span className="mystery-icon"><Brain size={22} /></span><div><span className="section-kicker">JOUEUR MYSTÈRE</span><h2>Quel est ce joueur ?</h2></div><span className="career-level">{difficulties.find(option => option.id === game.difficulty)?.name}</span></div>
    <CareerTimeline career={game.career} />
    <p className="career-data-note">{game.dataNote}</p>
    <form className="answer-form" onSubmit={onSubmit}>
      <label htmlFor="career-answer">Votre réponse</label><input id="career-answer" name="answer" type="text" placeholder="Prénom et nom du joueur" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={120} required disabled={busy} value={answer} onChange={event => setAnswer(event.target.value)} />
      <div><span><Info size={14} /> Une seule tentative. Prenez votre temps.</span><button className="button primary" disabled={busy || !answer.trim()} type="submit">{busy ? 'Vérification…' : 'Valider'}<Check size={18} /></button></div>
    </form>
  </section>;
}

export function CareerResult({ game, difficulty, setDifficulty, busy, onStart }) {
  return <section className={'career-result ' + (game.correct ? 'success' : 'failure')}>
    <div className="career-outcome" role="status"><span className="career-result-icon">{game.correct ? <Check size={30} /> : <X size={30} />}</span><span className="section-kicker">{game.correct ? 'BRAVO !' : 'LA RÉPONSE EST RÉVÉLÉE'}</span><h2>{game.message}</h2><p>{game.correct ? 'Vous avez reconnu le joueur grâce à son parcours.' : 'La bonne réponse était :'}</p><h3>{game.player.name}</h3><div className="career-reveal-portrait"><Portrait player={game.player} /></div></div>
    <div className="career-result-timeline"><h3>Voici son parcours</h3><CareerTimeline career={game.player.career} /><p className="career-data-note">{game.dataNote}</p></div>
    <div className="career-replay"><DifficultyPicker value={difficulty} onChange={setDifficulty} disabled={busy} /><button className="button primary" disabled={busy} onClick={onStart}>{busy ? 'Recherche d’un autre joueur…' : 'Nouvelle partie'}<ArrowRight size={18} /></button></div>
  </section>;
}
