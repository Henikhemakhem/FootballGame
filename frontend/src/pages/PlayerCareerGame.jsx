import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { GameNavigation, PlatformFooter } from '../components/GameNavigation.jsx';
import { CareerSetup, CareerRound, CareerResult } from '../components/PlayerCareerViews.jsx';
import { request, savedCareerGame, saveCareerGame } from '../api.js';

export default function PlayerCareerGame() {
  const [game, setGame] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(Boolean(savedCareerGame()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const id = savedCareerGame();
    if (!id) { setLoading(false); return; }
    request('/player-career/' + encodeURIComponent(id)).then(data => {
      if (!cancelled) { setGame(data); setDifficulty(data.difficulty); }
    }).catch(err => {
      if (!cancelled) { setError(err.message); if (err.status === 404) saveCareerGame(null); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await request('/player-career/start', { difficulty, ...(game ? { previousGameId: game.gameId } : {}) });
      saveCareerGame(data.gameId);
      setGame(data);
      setAnswer('');
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current || game?.status !== 'PLAYING' || !answer.trim()) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      setGame(await request('/player-career/' + game.gameId + '/answer', { answer: answer.trim() }));
    } catch (err) {
      setError(err.message);
      // Une réponse perdue peut avoir été validée : relire sans soumettre une seconde tentative.
      try { setGame(await request('/player-career/' + game.gameId)); } catch { /* Conserver le premier message. */ }
    } finally { lock.current = false; setBusy(false); }
  }

  async function restore() {
    const id = savedCareerGame();
    if (!id || lock.current) return;
    lock.current = true;
    setLoading(true);
    setError('');
    try { const data = await request('/player-career/' + encodeURIComponent(id)); setGame(data); setDifficulty(data.difficulty); }
    catch (err) { setError(err.message); if (err.status === 404) saveCareerGame(null); }
    finally { lock.current = false; setLoading(false); }
  }

  return <div className="app-shell">
    <GameNavigation current="career" />
    <main className="career-page">
      <div className="career-heading"><span className="section-kicker">UN PARCOURS. UN NOM À RETROUVER.</span><h1>Parcours du joueur</h1><p>Suivez les clubs dans l’ordre chronologique et devinez le joueur.</p></div>
      {error && <div className="notice" role="alert"><Info size={17} /><span>{error}</span>{!game && savedCareerGame() && <button onClick={restore} disabled={busy || loading}>Réessayer</button>}<button aria-label="Fermer le message" onClick={() => setError('')}><X size={16} /></button></div>}
      {loading ? <p className="loading" role="status">Retour sur votre parcours…</p>
        : !game ? <CareerSetup difficulty={difficulty} setDifficulty={setDifficulty} busy={busy} onStart={start} />
        : game.status === 'PLAYING' ? <CareerRound game={game} answer={answer} setAnswer={setAnswer} busy={busy} onSubmit={submit} />
        : <CareerResult game={game} difficulty={difficulty} setDifficulty={setDifficulty} busy={busy} onStart={start} />}
    </main>
    <PlatformFooter />
  </div>;
}
