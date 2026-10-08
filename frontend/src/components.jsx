import { useState } from 'react';
import { ArrowRight, CircleDollarSign, Flag, Gavel, Gift, Info, Shield, Trophy, Users } from 'lucide-react';

export const positions = { Attacker: 'Attaquant', Midfielder: 'Milieu', Defender: 'Défenseur', Goalkeeper: 'Gardien' };
export const money = value => '$' + value;

export function Portrait({ player, small = false }) {
  const [failed, setFailed] = useState(false);
  return <img className={small ? 'portrait-small' : 'portrait'} src={failed || !player.photo ? '/portraits/player.svg' : player.photo}
    alt={small ? '' : 'Portrait de ' + player.name} onError={() => setFailed(true)} />;
}

export function Setup({ onStart, busy }) {
  return <section className="setup-layout">
    <div className="intro">
      <div className="eyebrow"><span className="live-dot" /> LES ENCHÈRES SONT OUVERTES</div>
      <h1>Votre équipe.<br />Vos enchères.<br /><span>Votre victoire.</span></h1>
      <p>Deux managers. Un budget de $200 chacun.<br />Remportez l’enchère ou recevez une surprise<br className="desktop-break" /> gratuite du même poste.</p>
      <div className="intro-meta"><Users size={18} /> 2 joueurs <span /> <CircleDollarSign size={18} /> $200 chacun <span /> <Shield size={18} /> 6 recrues</div>
      <div className="setup-composition">1 gardien · 2 défenseurs · 2 milieux · 1 attaquant</div>
      <div className="pitch-art" aria-hidden="true"><div className="pitch-line" /><div className="pitch-circle" /><div className="pitch-goal" /><span className="pitch-player one">01</span><span className="pitch-player two">02</span><span className="pitch-ball">⚽</span></div>
    </div>
    <div className="setup-card">
      <span className="section-kicker">LE COUP D’ENVOI</span>
      <h2>Qui entre sur le terrain ?</h2>
      <p>Installez-vous à deux sur le même écran.</p>
      <form onSubmit={event => { event.preventDefault(); onStart(new FormData(event.currentTarget)); }}>
        <label htmlFor="player1"><span className="manager-number">01</span> Premier manager</label>
        <input id="player1" name="player1Name" placeholder="Ex. Alex" required maxLength={24} autoComplete="off" disabled={busy} />
        <label htmlFor="player2"><span className="manager-number second">02</span> Deuxième manager</label>
        <input id="player2" name="player2Name" placeholder="Ex. Sam" required maxLength={24} autoComplete="off" disabled={busy} />
        <button className="button primary start-button" disabled={busy} type="submit">{busy ? 'Préparation du terrain…' : 'Lancer les enchères'}<ArrowRight size={20} /></button>
      </form>
      <div className="setup-note"><Info size={16} /><span>Six manches. Une recrue par manager, à chaque manche.</span></div>
    </div>
  </section>;
}

function teamSlots(game, team) {
  if (game.legacy) return [...team, ...Array.from({ length: Math.max(0, game.teamSize - team.length) }, () => null)];
  const counts = {};
  return game.roundPositions.map(position => {
    const index = counts[position] || 0;
    counts[position] = index + 1;
    return { player: team.filter(player => player.position === position)[index], position };
  });
}

export function TeamPanel({ game, owner }) {
  const active = !game.legacy && game.status === 'active' && game.currentPlayer === owner;
  const team = game.teams[owner];
  const slots = teamSlots(game, team);
  return <section className={'team-panel' + (active ? ' active' : '')} aria-label={'Équipe de ' + game['player' + owner + 'Name']}>
    <div className="team-heading"><span className={'manager-number' + (owner === 2 ? ' second' : '')}>0{owner}</span><span className={'status-pill' + (active ? ' playing' : '')}>{game.legacy ? 'Ancienne partie' : active ? 'À vous d’enchérir' : game.status === 'finished' ? 'Équipe complète' : 'En attente'}</span></div>
    <h2>{game['player' + owner + 'Name']}</h2>
    <div className="budget"><span>Budget restant</span><strong>{money(game['player' + owner + 'Money'])}</strong></div>
    <div className="budget-track"><span style={{ width: game['player' + owner + 'Money'] / 2 + '%' }} /></div>
    {!game.legacy && <div className="position-counts" aria-label="Composition de l’équipe">{Object.entries(game.positionLimits).map(([position, limit]) =>
      <div key={position}><span>{positions[position]}</span><b>{team.filter(p => p.position === position).length}/{limit}</b></div>)}</div>}
    <div className="roster-heading"><h3>Votre sélection</h3><span>{team.length} / {game.teamSize}</span></div>
    <div className="roster">
      {slots.map((slot, i) => {
        const player = game.legacy ? slot : slot.player;
        return player ? <div className="roster-player" key={player.footballPlayerId}><Portrait player={player} small /><div><strong>{player.name}</strong><span>{positions[player.position] || player.position}</span></div><b className={player.price === 0 ? 'free-price' : ''}>{player.price === 0 ? 'Gratuit' : money(player.price)}</b></div>
          : <div className="empty-slot" key={'empty-' + i}><span>+</span>{game.legacy ? 'Une place à prendre' : positions[slot.position]}</div>;
      })}
    </div>
    <div className="team-score"><Trophy size={15} /><span>Score de l’équipe</span><strong>{game.scores[owner]} <small>pts</small></strong></div>
  </section>;
}

export function AuctionCard({ game, busy, onBid, onPass }) {
  const auction = game.auction;
  const player = auction.offeredPlayer;
  const budget = game['player' + game.currentPlayer + 'Money'];
  const minimum = auction.currentPrice + 1;
  const canBid = budget >= minimum;
  const [amount, setAmount] = useState(String(Math.max(minimum, Math.min(auction.currentPrice + 10, budget))));
  const number = Number(amount);
  const valid = amount !== '' && Number.isSafeInteger(number) && number >= minimum && number <= budget;
  return <section className="offer-column" aria-label="Enchère actuelle">
    <div className="offer-label"><span className="live-dot" /><span>MANCHE {game.round} / {game.totalRounds}</span><span className="offer-owner">{game['player' + game.currentPlayer + 'Name']}, à vous d’enchérir</span></div>
    <article className="player-card" key={player.id}>
      <div className={'player-visual position-' + player.position.toLowerCase()}>
        <div className="card-top"><span className="position-badge"><Shield size={13} />{positions[player.position]}</span><span className="card-brand">FD / 0{game.round}</span></div>
        <span className="visual-word" aria-hidden="true">DRAFT</span><div className="visual-circle" /><Portrait player={player} />
        <span className="photo-caption">{player.id.startsWith('demo-') || player.photo?.startsWith('/portraits/') ? 'PORTRAIT ILLUSTRÉ · DÉMO' : 'FOOTBALL DRAFT'}</span>
      </div>
      <div className="player-details">
        <span className="section-kicker">UNE RECRUE, DEUX PRÉTENDANTS</span><h2>{player.name}</h2>
        <div className="player-meta"><span><Shield size={14} />{player.team}</span><span><Flag size={14} />{player.nationality}</span></div>
        <div className="player-price"><div><span>ENCHÈRE ACTUELLE</span><strong>{money(auction.currentPrice)}</strong></div><span className="after-budget">{auction.currentBidder ? <>Dernière enchère<br /><b>{game['player' + auction.currentBidder + 'Name']}</b></> : <>Première offre<br /><b>À partir de $1</b></>}</span></div>
      </div>
    </article>
    <div className="auction-controls">
      <p className="bid-turn"><Gavel size={16} /><strong>{game['player' + game.currentPlayer + 'Name']}</strong><span>Budget : {money(budget)}</span></p>
      <div className="bid-increments">{[10, 20, 30].map(increment => <button key={increment} type="button" disabled={busy || auction.currentPrice + increment > budget} onClick={() => onBid(auction.currentPrice + increment)}>+{increment} $</button>)}</div>
      <form className="bid-form" onSubmit={event => { event.preventDefault(); if (valid && !busy) onBid(number); }}>
        <label htmlFor="bid-amount">Votre offre <span>(min. {money(minimum)})</span></label>
        <div><input id="bid-amount" type="number" inputMode="numeric" step="1" min={minimum} max={budget} value={amount} required disabled={busy || !canBid} onChange={event => setAmount(event.target.value)} /><button className="button primary" type="submit" disabled={busy || !valid || !canBid}><Gavel size={16} /> Enchérir</button></div>
      </form>
      <button className="button pass-button" disabled={busy} onClick={onPass}>Passer{auction.currentBidder ? ' · ' + game['player' + auction.currentBidder + 'Name'] + ' remporte le joueur' : ''}</button>
      {!canBid && <p className="budget-warning">Votre budget ne permet plus de surenchérir. Passez pour recevoir votre joueur gratuit.</p>}
      <p className="offer-hint"><Gift size={15} /> Le perdant reçoit gratuitement un autre {positions[player.position].toLowerCase()}.</p>
      {!auction.currentBidder && <p className="opening-hint">{auction.openingPasses ? 'Le premier manager a passé. Si vous passez aussi, les deux recrues seront gratuites.' : 'Sans offre, passer donne la main à l’autre manager.'}</p>}
    </div>
  </section>;
}

export function AuctionSummary({ game, result }) {
  return <section className="auction-summary offer-column" aria-live="polite">
    <div className="offer-label"><span className="live-dot" /><span>MANCHE {result.round} TERMINÉE</span></div>
    <div className="round-result">
      <span className="result-trophy">{result.noBids ? <Gift size={36} /> : <Trophy size={36} />}</span>
      <span className="section-kicker">{result.noBids ? 'DEUX RECRUES GRATUITES' : 'ENCHÈRE REMPORTÉE'}</span>
      <h2>{game['player' + result.winner + 'Name']} reçoit {result.soldPlayer.name}</h2>
      <p className="round-price">{money(result.finalPrice)}</p>
      <p>Budget restant : <strong>{money(game['player' + result.winner + 'Money'])}</strong></p>
      <div className="free-recruit"><Gift size={22} /><div><span>{game['player' + result.loser + 'Name']} reçoit gratuitement</span><strong>{result.freePlayer.name}</strong><small>{positions[result.position]} · $0 · Budget : {money(game['player' + result.loser + 'Money'])}</small></div></div>
      <p className="next-round-hint">{game.status === 'finished' ? 'Les équipes sont complètes. Résultat final dans quelques secondes…' : 'La manche ' + game.round + ' — ' + positions[game.auction.position] + ' démarre dans quelques secondes…'}</p>
    </div>
  </section>;
}

export function Results({ game, onRestart }) {
  const winner = game.result.winner;
  return <section className="results-card">
    <span className="result-trophy"><Trophy size={42} /></span><span className="section-kicker">COUP DE SIFFLET FINAL</span>
    <h2>{winner ? game['player' + winner + 'Name'] + ' remporte la draft !' : 'Une belle égalité !'}</h2>
    <p>Six manches terminées : 1 gardien, 2 défenseurs, 2 milieux et 1 attaquant par équipe.</p>
    <div className="result-scores">{[1, 2].map(owner => <div key={owner} className={winner === owner ? 'winner' : ''}><span>{game['player' + owner + 'Name']}</span><strong>{game.scores[owner]}<small> points</small></strong><span>{money(game['player' + owner + 'Money'])} restants · {game.teams[owner].length} recrues</span></div>)}</div>
    <p className="score-explanation">Score V1 conservé : somme des prix payés aux enchères. Les recrues gratuites valent 0 point.</p>
    <button className="button primary" onClick={onRestart}>Rejouer <ArrowRight size={18} /></button>
  </section>;
}
