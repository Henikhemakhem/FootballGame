import { suitableCareer } from './careerService.js';
import { GameError } from './gameError.js';
export const POSITION_CODES = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', ATT: 'Attacker' };
export function validateCatalogue(data) {
  if (data?.version !== 1 || !Array.isArray(data.players) || !Array.isArray(data.careers)) throw new Error('Catalogue de joueurs invalide.');
  const ids = new Set();
  for (const player of data.players) {
    if (typeof player.id !== 'string' || ids.has(player.id) || typeof player.name !== 'string' || !player.name.trim()
      || !Object.values(POSITION_CODES).includes(player.position) || player.source !== 'api') throw new Error('Profil de joueur invalide.');
    ids.add(player.id);
  }
  for (const [position, minimum] of Object.entries({ Goalkeeper: 2, Defender: 4, Midfielder: 4, Attacker: 2 })) {
    if (data.players.filter(player => player.position === position).length < minimum) throw new Error('Pas assez de joueurs API pour chaque poste.');
  }
  const careers = new Set();
  for (const player of data.careers) {
    if (!ids.has(player.id) || careers.has(player.id) || !suitableCareer(player.career) || !player.name?.trim().includes(' ')
      || /\b\p{L}\./u.test(player.name)) throw new Error('Parcours de joueur invalide.');
    careers.add(player.id);
  }
  if (data.careers.length < 2) throw new Error('Au moins deux parcours API jouables sont nécessaires.');
  return data;
}
export class BrowserCatalogue {
  constructor(data) { this.data = validateCatalogue(data); }
  getPlayers(position) {
    if (position && !Object.hasOwn(POSITION_CODES, position)) throw new GameError(400, 'INVALID_POSITION', 'Poste attendu : GK, DEF, MID ou ATT.');
    return structuredClone(this.data.players.filter(player => !position || player.position === POSITION_CODES[position]));
  }
  getRandomCareerPlayer({ excluded, pick }) {
    const candidates = this.data.careers.filter(player => player.id !== excluded);
    if (!candidates.length) throw new GameError(502, 'NO_SUITABLE_CAREER', 'Aucun autre parcours API disponible.');
    return structuredClone(candidates[pick(candidates.length)]);
  }
  counts() { return { Player: this.data.players.length, PlayableCareers: this.data.careers.length }; }
}
