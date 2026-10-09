import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCatalogue } from '../frontend/src/games/catalogue.js';
import { suitableCareer } from '../frontend/src/games/careerService.js';

const database = new DatabaseSync(process.argv[2] || fileURLToPath(new URL('../backend/data/football-draft.sqlite', import.meta.url)), { readOnly: true });
try {
  const rows = database.prepare("SELECT p.*, c.name AS team FROM Player p LEFT JOIN Club c ON c.id=p.currentClubId WHERE p.source='api' ORDER BY p.id").all();
  const players = rows.map(player => ({ id: 'api-' + player.apiPlayerId, apiPlayerId: player.apiPlayerId,
    name: player.name, photo: player.photo || null, team: player.team || 'Club non renseigné',
    nationality: player.nationality || 'Non renseignée', position: player.position, source: 'api' }));
  const careers = rows.flatMap((row, index) => {
    const career = database.prepare(`SELECT c.name AS club, pc.startDate AS "from", pc.endDate AS "to" FROM PlayerCareer pc
      JOIN Club c ON c.id=pc.clubId WHERE pc.playerId=? AND pc.active=1 AND pc.source='api'
      ORDER BY COALESCE(pc.startDate,''), COALESCE(pc.endDate,'9999'), pc.id`).all(row.id).map(step => ({ ...step }));
    return suitableCareer(career) && row.name.trim().includes(' ') && !/\b\p{L}\./u.test(row.name)
      ? [{ ...players[index], career, dataNote: 'Historique API-Football ; les dates inconnues ne sont pas inventées.' }] : [];
  });
  const data = validateCatalogue({ version: 1, updatedAt: new Date().toISOString(), league: 39, season: 2024, players, careers });
  mkdirSync(new URL('../frontend/public/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../frontend/public/players.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
  console.log(`Catalogue public exporté : ${players.length} joueurs API, ${careers.length} parcours. Aucune partie ni clé exportée.`);
} finally { database.close(); }
