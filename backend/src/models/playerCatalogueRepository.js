import { createHash, randomInt } from 'node:crypto';
import { mockPlayers } from '../data/mockPlayers.js';
import { mockCareers } from '../data/mockCareers.js';
import { GameError } from '../services/gameError.js';
import { suitableCareer } from '../services/careerService.js';

export const POSITION_CODES = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', ATT: 'Attacker' };
const folded = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/gu, ' ');
const demoClubId = name => 'demo-club-' + createHash('sha256').update(folded(name)).digest('hex').slice(0, 20);

export class PlayerCatalogueRepository {
  constructor(db) { this.db = db; }

  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  upsertClub(club, source = 'api') {
    if (club?.id == null || !club.name?.trim()) return null;
    let old = this.db.prepare('SELECT * FROM Club WHERE apiClubId = ?').get(String(club.id));
    if (!old && source === 'api') {
      const matches = this.db.prepare("SELECT * FROM Club WHERE source = 'mock'").all().filter(row => folded(row.name) === folded(club.name));
      if (matches.length === 1) old = matches[0];
    }
    if (old) {
      this.db.prepare('UPDATE Club SET apiClubId=?, name=?, logo=COALESCE(?,logo), country=COALESCE(?,country), source=? WHERE id=?')
        .run(String(club.id), club.name.trim(), club.logo || null, club.country || null, source, old.id);
      return { id: old.id, added: false };
    }
    const result = this.db.prepare('INSERT INTO Club (apiClubId,name,logo,country,source) VALUES (?,?,?,?,?)')
      .run(String(club.id), club.name.trim(), club.logo || null, club.country || null, source);
    return { id: Number(result.lastInsertRowid), added: true };
  }

  upsertPlayer(player, clubId, source = 'api') {
    let old = this.db.prepare('SELECT * FROM Player WHERE apiPlayerId=?').get(String(player.id));
    let name = player.fullName || player.name;
    // Only reconcile the original demonstration rows; real identities use API IDs exclusively.
    if (!old && source === 'api') {
      const names = new Set([folded(name), folded(player.name)]);
      const matches = this.db.prepare("SELECT * FROM Player WHERE source='mock'").all().filter(row => names.has(folded(row.name)));
      if (matches.length === 1) old = matches[0];
    }
    if (old && /\b\p{L}\./u.test(name) && !/\b\p{L}\./u.test(old.name)) name = old.name;
    const values = [String(player.id), name.trim(), player.firstname || null, player.lastname || null,
      Number.isInteger(player.age) && player.age > 0 ? player.age : null, player.nationality || null,
      player.photo || null, player.position, player.height || null, player.weight || null, clubId || null, source];
    if (old) {
      this.db.prepare(`UPDATE Player SET apiPlayerId=?, name=?, firstname=COALESCE(?,firstname), lastname=COALESCE(?,lastname),
        age=COALESCE(?,age), nationality=COALESCE(?,nationality), photo=COALESCE(?,photo), position=?,
        height=COALESCE(?,height), weight=COALESCE(?,weight), currentClubId=COALESCE(?,currentClubId), source=? WHERE id=?`).run(...values, old.id);
      return { id: old.id, added: false };
    }
    const result = this.db.prepare(`INSERT INTO Player (apiPlayerId,name,firstname,lastname,age,nationality,photo,position,height,weight,currentClubId,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values);
    return { id: Number(result.lastInsertRowid), added: true };
  }

  upsertCareer(playerId, clubId, step, source = 'api', active = true) {
    // The end date can evolve when the player changes club. It is not part of the identity.
    const stintKey = JSON.stringify([clubId, step.from || '', step.season || '', source]);
    const old = this.db.prepare('SELECT id, active FROM PlayerCareer WHERE playerId=? AND stintKey=?').get(playerId, stintKey);
    if (old) {
      if (!active && old.active) return false;
      this.db.prepare('UPDATE PlayerCareer SET endDate=COALESCE(?,endDate), active=? WHERE id=?').run(step.to || null, Number(active), old.id);
      return false;
    }
    this.db.prepare(`INSERT INTO PlayerCareer (playerId,clubId,startDate,endDate,season,source,stintKey,active)
      VALUES (?,?,?,?,?,?,?,?)`).run(playerId, clubId, step.from || null, step.to || null, step.season || null, source, stintKey, Number(active));
    return true;
  }

  getPlayers(position) {
    if (position != null && (typeof position !== 'string' || !Object.hasOwn(POSITION_CODES, position))) throw new GameError(400, 'INVALID_POSITION', 'Poste attendu : GK, DEF, MID ou ATT.');
    return this.db.prepare(`SELECT p.*, c.name AS team FROM Player p LEFT JOIN Club c ON c.id=p.currentClubId
      ${position ? 'WHERE p.position=?' : ''} ORDER BY p.id`).all(...(position ? [POSITION_CODES[position]] : [])).map(row => ({
      ...row, id: 'local-' + row.id, team: row.team || 'Club non renseigné', nationality: row.nationality || 'Non renseignée',
    }));
  }

  getPlayerCareer(id) {
    const playerId = Number(String(id).replace(/^local-/, ''));
    return this.db.prepare(`SELECT c.name AS club, pc.startDate AS "from", pc.endDate AS "to" FROM PlayerCareer pc
      JOIN Club c ON c.id=pc.clubId WHERE pc.playerId=? AND pc.active=1
      ORDER BY COALESCE(pc.startDate,''), COALESCE(pc.endDate,'9999'), pc.id`).all(playerId).map(row => ({ ...row }));
  }

  getCareerCandidates() {
    const ids = new Set(this.db.prepare(`SELECT playerId FROM PlayerCareer WHERE active=1 GROUP BY playerId
      HAVING COUNT(DISTINCT clubId)>=3`).all().map(row => 'local-' + row.playerId));
    return this.getPlayers().filter(player => ids.has(player.id) && player.name.trim().split(/\s+/u).length >= 2
      && !/\b\p{L}\./u.test(player.name) && suitableCareer(this.getPlayerCareer(player.id)))
      .map(player => {
        const careerSource = this.db.prepare("SELECT 1 FROM PlayerCareer WHERE playerId=? AND active=1 AND source='api' LIMIT 1")
          .get(Number(player.id.slice(6))) ? 'api' : 'mock';
        return { ...player, careerSource, dataNote: careerSource === 'api'
          ? 'Historique API-Football enregistré dans SQLite ; les dates inconnues ne sont pas inventées.'
          : 'Parcours de démonstration arrêté fin 2024, enregistré dans SQLite.' };
      });
  }

  getRandomCareerPlayer({ excluded = null, pick = length => randomInt(length) } = {}) {
    const all = this.getCareerCandidates();
    const api = all.filter(player => player.careerSource === 'api');
    const candidates = (api.length ? api : all).filter(player => player.id !== excluded && player.apiPlayerId !== excluded);
    if (!candidates.length) throw new GameError(502, 'NO_SUITABLE_CAREER', 'Aucun nouveau parcours local avec au moins trois clubs. Enrichissez les parcours avec npm run sync:careers.');
    const player = candidates[pick(candidates.length)];
    return { ...player, career: this.getPlayerCareer(player.id) };
  }

  counts() {
    return Object.fromEntries(['Player','Club','PlayerCareer'].map(table => [table, this.db.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
  }
}

export function seedCatalogue(db) {
  const repository = new PlayerCatalogueRepository(db);
  if (repository.counts().Player) return;
  repository.transaction(() => {
    if (repository.counts().Player) return;
    for (const player of mockPlayers) {
      const club = repository.upsertClub({ id: demoClubId(player.team), name: player.team }, 'mock');
      const saved = repository.upsertPlayer(player, club.id, 'mock');
      const history = mockCareers.find(item => item.id === player.id);
      for (const step of history?.career || []) {
        const careerClub = repository.upsertClub({ id: demoClubId(step.club), name: step.club }, 'mock');
        repository.upsertCareer(saved.id, careerClub.id, step, 'mock');
      }
    }
  });
}
