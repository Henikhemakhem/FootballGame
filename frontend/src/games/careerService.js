// Normalisation des transferts du fournisseur, sans nom, logo ni identifiant dans les indices.
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const clubKey = club => club?.id != null ? String(club.id) : club?.name;
const validClub = club => typeof club?.name === 'string' && club.name.trim() && club.name !== 'N/A';

export function careerFromTransfers(entries, playerId, { includeClubs = false } = {}) {
  const transfers = entries.filter(entry => String(entry?.player?.id) === String(playerId))
    .flatMap(entry => Array.isArray(entry.transfers) ? entry.transfers : [])
    .filter(move => validDate(move?.date) && validClub(move?.teams?.out) && validClub(move?.teams?.in)
      && clubKey(move.teams.out) !== clubKey(move.teams.in))
    .sort((a, b) => a.date.localeCompare(b.date));
  const unique = transfers.filter((move, index) => index === 0 || move.date !== transfers[index - 1].date
    || clubKey(move.teams.in) !== clubKey(transfers[index - 1].teams.in)
    || clubKey(move.teams.out) !== clubKey(transfers[index - 1].teams.out));
  if (!unique.length) return [];
  // Si deux mouvements différents partagent une date, leur ordre n'est pas fiable.
  if (unique.some((move, i) => i > 0 && move.date === unique[i - 1].date)) return [];
  const first = unique[0];
  const step = (team, from, to) => ({ club: team.name.trim(), from, to, ...(includeClubs ? { team } : {}) });
  const career = [step(first.teams.out, null, first.date)];
  let currentClub = first.teams.out;
  for (const move of unique) {
    // Un trou dans l'historique ne doit jamais devenir un parcours inventé.
    if (clubKey(currentClub) !== clubKey(move.teams.out)) return [];
    career[career.length - 1].to = move.date;
    career.push(step(move.teams.in, move.date, null));
    currentClub = move.teams.in;
  }
  return career;
}

export function suitableCareer(career) {
  return Array.isArray(career) && career.length >= 3
    && career.every(step => typeof step.club === 'string' && step.club.trim())
    && new Set(career.map(step => step.club.toLocaleLowerCase('fr'))).size >= 3;
}

export function periodFor(step, exact = false) {
  const format = value => !value ? null : exact ? value : value.slice(0, 4);
  const from = format(step.from);
  const to = format(step.to);
  if (!from) return to ? 'Avant ' + to : 'Période non renseignée';
  if (!to) return 'Depuis ' + from;
  return from === to ? from : from + ' – ' + to;
}

export function careerHints(career, difficulty) {
  return career.map(step => difficulty === 'hard' ? { club: step.club }
    : { club: step.club, season: periodFor(step, difficulty === 'easy') });
}
