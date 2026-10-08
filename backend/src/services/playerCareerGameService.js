import { randomInt, randomUUID } from 'node:crypto';
import { PlayerCatalogueRepository } from '../models/playerCatalogueRepository.js';
import { careerHints, suitableCareer } from './careerService.js';
import { GameError } from './gameError.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export function normalizeAnswer(answer) {
  return answer.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim().replace(/\s+/gu, ' ');
}

export class PlayerCareerGameService {
  constructor(repository, { football = new PlayerCatalogueRepository(repository.db), pick = length => randomInt(length) } = {}) {
    this.repository = repository;
    this.football = football;
    this.pick = pick;
  }

  find(id) {
    const game = this.repository.get(id);
    if (!game) throw new GameError(404, 'CAREER_GAME_NOT_FOUND', 'Cette partie de parcours est introuvable.');
    return game;
  }

  async start(input = {}) {
    const difficulty = input?.difficulty || 'medium';
    if (!DIFFICULTIES.includes(difficulty)) throw new GameError(400, 'INVALID_DIFFICULTY', 'Choisissez une difficulté valide.');
    let excluded = null;
    if (input?.previousGameId != null) {
      if (typeof input.previousGameId !== 'string' || input.previousGameId.length > 64) {
        throw new GameError(400, 'INVALID_PREVIOUS_GAME', 'La partie précédente est invalide.');
      }
      excluded = this.find(input.previousGameId).playerId;
    }
    const selected = this.football.getRandomCareerPlayer ? this.football.getRandomCareerPlayer({ excluded, pick: this.pick }) : null;
    const signal = AbortSignal.timeout(45000);
    const all = selected ? [selected] : await this.football.getCareerCandidates();
    const candidates = [...new Map(all.filter(player => String(player.id) !== excluded && typeof player.name === 'string'
      && player.name.trim().split(/\s+/u).length >= 2).map(player => [String(player.id), player])).values()];
    // Recherche bornée pour ne pas épuiser le quota API sur des historiques incomplets.
    const attempts = Math.min(candidates.length, 8);
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal.aborted) throw new GameError(502, 'CAREER_LOAD_TIMEOUT', 'Le chargement du parcours a pris trop de temps. Réessayez.');
      const player = candidates.splice(this.pick(candidates.length), 1)[0];
      const raw = selected ? selected.career : await this.football.getPlayerCareer(player.id, { signal });
      if (!suitableCareer(raw)) continue;
      // Ne conserver que les champs du parcours ; aucune donnée fournisseur ne devient un indice implicite.
      const career = raw.map(step => ({ club: step.club.trim(), from: step.from || null, to: step.to || null }));
      const game = { id: randomUUID(), playerId: String(player.id), playerName: player.name.trim(),
        playerPhoto: player.photo || null, career, difficulty, createdAt: new Date().toISOString(),
        dataNote: player.dataNote || 'Parcours issu des données disponibles du fournisseur.' };
      this.repository.create(game);
      return this.get(game.id);
    }
    throw new GameError(502, 'NO_SUITABLE_CAREER', 'Aucun nouveau parcours suffisamment renseigné n’a été trouvé. Réessayez ou choisissez une autre ligue.');
  }

  get(id) {
    const game = this.find(id);
    const response = {
      gameId: game.id, status: game.status, difficulty: game.difficulty,
      career: careerHints(game.career, game.difficulty), dataNote: game.dataNote,
    };
    if (game.status === 'FINISHED') {
      response.correct = Boolean(game.isCorrect);
      response.message = response.correct ? 'Bonne réponse !' : 'Tu as échoué !';
      response.player = { name: game.playerName, photo: game.playerPhoto, career: careerHints(game.career, 'easy') };
    }
    return response;
  }

  answer(id, input) {
    if (typeof input?.answer !== 'string' || !input.answer.trim() || input.answer.length > 120) {
      throw new GameError(400, 'INVALID_ANSWER', 'Saisissez un nom de joueur de 1 à 120 caractères.');
    }
    return this.repository.transaction(() => {
      const game = this.find(id);
      if (game.status !== 'PLAYING') throw new GameError(409, 'CAREER_GAME_FINISHED', 'Cette réponse a déjà été validée. Lancez une nouvelle partie.');
      const correct = normalizeAnswer(input.answer) === normalizeAnswer(game.playerName);
      if (!this.repository.answer(id, input.answer.trim(), correct, new Date().toISOString())) {
        throw new GameError(409, 'CAREER_GAME_FINISHED', 'Cette réponse a déjà été validée.');
      }
      return this.get(id);
    });
  }
}
