import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleHelp, Info, RotateCcw, X } from 'lucide-react';
import { AuctionCard, AuctionSummary, Results, Setup, TeamPanel, positions } from '../components.jsx';
import { request, savedGame, saveGame } from '../api.js';
import { GameNavigation } from '../components/GameNavigation.jsx';

export default function AuctionGame() {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(Boolean(savedGame()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const lock = useRef(false);
  const restartDialog = useRef(null);

  useEffect(() => {
    if (!roundResult) return;
    const timer = window.setTimeout(() => setRoundResult(null), 4000);
    return () => window.clearTimeout(timer);
  }, [roundResult]);

  useEffect(() => {
    let cancelled = false;
    request('/health').then(data => { if (!cancelled) setMode(data.dataMode); }).catch(() => {});
    const id = savedGame();
    if (id) request(`/games/${encodeURIComponent(id)}`).then(data => {
      if (!cancelled) setGame(data);
    }).catch(err => {
      if (!cancelled) {
        setError(err.message);
        if (err.status === 404) saveGame(null);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    else setLoading(false);
    return () => { cancelled = true; };
  }, []);

  async function start(form) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await request('/games', { player1Name: form.get('player1Name').trim(), player2Name: form.get('player2Name').trim() });
      setGame(data);
      saveGame(data.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function decide(action, amount) {
    if (lock.current || roundResult || !game || game.legacy || game.status !== 'active') return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await request(`/games/${game.id}/${action}`, {
        player: game.currentPlayer, version: game.version, playerId: game.auction.offeredPlayer.id,
        ...(action === 'bid' ? { amount } : {}),
      });
      setGame(data);
      if (data.lastRound && data.lastRound.round !== game.lastRound?.round) setRoundResult(data.lastRound);
    } catch (err) {
      setError(err.message);
      // Une décision concurrente ou une réponse perdue exige de relire l'état du serveur.
      try { setGame(await request(`/games/${game.id}`)); } catch { /* Afficher l'erreur initiale. */ }
    } finally { lock.current = false; setBusy(false); }
  }

  function restart() {
    restartDialog.current?.close();
    setGame(null);
    setRoundResult(null);
    saveGame(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function restore() {
    const id = savedGame();
    if (!id || lock.current) return;
    lock.current = true;
    setLoading(true);
    setError('');
    try { setGame(await request(`/games/${encodeURIComponent(id)}`)); }
    catch (err) { setError(err.message); if (err.status === 404) saveGame(null); }
    finally { lock.current = false; setLoading(false); }
  }

  return <div className="app-shell">
    <GameNavigation current="auction" accessory={<button className="rules-toggle" aria-expanded={rulesOpen} aria-controls="rules" onClick={() => setRulesOpen(!rulesOpen)}><CircleHelp size={17} /> Les règles</button>} />
    {rulesOpen && <section className="rules-panel" id="rules"><h2>Six manches, deux équipes</h2><ol><li>Chaque manager commence avec $200. L’ordre des manches : gardien, défenseur, défenseur, milieu, milieu, attaquant.</li><li>Enchérissez à tour de rôle : chaque offre doit dépasser la précédente d’au moins $1 et rester dans votre budget.</li><li>Passer donne le joueur au dernier enchérisseur. Seul le gagnant paie le dernier prix.</li><li>Le perdant reçoit automatiquement un autre joueur gratuit du même poste. Aucun joueur ne peut être attribué deux fois.</li><li>Le premier enchérisseur alterne à chaque manche. Chacun termine avec exactement six joueurs.</li><li>Avant la première offre, passer donne la main à l’autre. Si les deux passent sans enchère, les deux recrues sont gratuites.</li><li>Le score V1 reste la somme des prix payés ; les joueurs gratuits valent 0 point.</li></ol></section>}
    <main>
      {error && <div className="notice" role="alert"><Info size={17} /><span>{error}</span>{!game && savedGame() && <button onClick={restore} disabled={busy || loading}>Réessayer</button>}<button aria-label="Fermer le message" onClick={() => setError('')}><X size={16} /></button></div>}
      {loading ? <div className="loading" role="status">Retour sur le terrain…</div> : !game ? <Setup onStart={start} busy={busy} /> : <>
        <div className="game-title"><div><span className="section-kicker">{game.legacy ? 'PARTIE CONSERVÉE' : game.status === 'finished' ? 'LES JEUX SONT FAITS' : 'LES ENCHÈRES SONT OUVERTES'}</span><h1>{game.legacy ? 'Votre ancienne sélection.' : game.status === 'finished' ? 'Une draft, deux équipes.' : 'À vous de surenchérir.'}</h1><span className="subtext">{game.legacy ? 'Anciennes règles · Lecture seule' : game.status === 'finished' ? 'Découvrez votre sélection finale.' : `Manche ${game.round} / 6 · ${positions[game.auction.position]} · 6 recrues par équipe`}</span></div><button className="new-game" disabled={busy} onClick={() => game.status === 'active' && !game.legacy ? restartDialog.current.showModal() : restart()}><RotateCcw size={12} /> Nouvelle partie</button></div>
        {game.legacy ? <><section className="legacy-notice"><h2>Le jeu passe aux enchères</h2><p>Cette partie a été créée avec les anciennes règles. Vos équipes et budgets sont conservés. Lancez une nouvelle partie pour jouer les six manches.</p><button className="button primary" onClick={restart}>Créer une nouvelle partie <ArrowRight size={18} /></button></section><div className="finished-teams"><TeamPanel game={game} owner={1} /><TeamPanel game={game} owner={2} /></div></> : game.status === 'active' || roundResult ? <>
          <div className="game-grid"><TeamPanel game={game} owner={1} />{roundResult ? <AuctionSummary game={game} result={roundResult} /> : <AuctionCard key={`${game.id}:${game.version}`} game={game} busy={busy} onBid={amount => decide('bid', amount)} onPass={() => decide('pass')} />}<TeamPanel game={game} owner={2} /></div>
          <div className="action-log" aria-live="polite"><Info size={14} /><span>{busy ? 'Le serveur valide votre décision…' : game.lastAction ? `${game[`player${game.lastAction.owner}Name`]} ${game.lastAction.action === 'bid' ? `a proposé $${game.lastAction.amount} pour` : 'a passé pour'} ${game.lastAction.name}.` : `${game[`player${game.auction.firstBidder}Name`]} ouvre les enchères. Proposez un prix ou passez.`}</span></div>
          {!roundResult && game.lastRound && <p className="previous-round"><strong>Manche {game.lastRound.round} :</strong> {game[`player${game.lastRound.winner}Name`]} a reçu {game.lastRound.soldPlayer.name} pour ${game.lastRound.finalPrice} ; {game[`player${game.lastRound.loser}Name`]} a reçu {game.lastRound.freePlayer.name} gratuitement.</p>}
        </> : <><Results game={game} onRestart={restart} /><div className="finished-teams"><TeamPanel game={game} owner={1} /><TeamPanel game={game} owner={2} /></div></>}
      </>}
    </main>
    <footer><span>FOOTBALL DRAFT</span><span>Deux managers. Une seule victoire.</span><span>{mode === 'mock' ? 'ÉDITION DÉMO / V1' : mode === 'api' ? 'API FOOTBALL / V1' : mode === 'sqlite' ? 'CATALOGUE LOCAL / V1' : 'ÉDITION V1'}</span></footer>
    <dialog className="restart-dialog" ref={restartDialog}><h2>Une nouvelle draft ?</h2><p>Vous reviendrez à l’écran de création. La partie en cours ne sera plus reprise automatiquement.</p><div className="dialog-actions"><button className="button reject" onClick={() => restartDialog.current.close()}>Continuer</button><button className="button primary" onClick={restart}>Nouvelle partie <ArrowRight size={16} /></button></div></dialog>
  </div>;
}
