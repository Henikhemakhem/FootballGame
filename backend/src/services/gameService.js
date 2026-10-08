import { randomUUID, randomInt } from 'node:crypto';
import { GameError } from './gameError.js';
import { PlayerCatalogueRepository } from '../models/playerCatalogueRepository.js';
import { gameResult } from './scoreService.js';

export const ROUND_POSITIONS = ['Goalkeeper', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Attacker'];
export const POSITION_LIMITS = { Goalkeeper: 1, Defender: 2, Midfielder: 2, Attacker: 1 };
export const TEAM_SIZE = ROUND_POSITIONS.length;
const budgetKey = owner => 'player' + owner + 'Money';

export function organizeTeam(team) {
  return {
    goalkeeper: team.filter(player => player.position === 'Goalkeeper'),
    defenders: team.filter(player => player.position === 'Defender'),
    midfielders: team.filter(player => player.position === 'Midfielder'),
    attackers: team.filter(player => player.position === 'Attacker'),
  };
}

export class GameService {
  constructor(repository, { loadPlayers = () => new PlayerCatalogueRepository(repository.db).getPlayers(), pick = length => randomInt(length) } = {}) {
    this.repository = repository;
    this.loadPlayers = loadPlayers;
    this.pick = pick;
  }

  async create(input) {
    const names = [input?.player1Name, input?.player2Name].map(name => {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 24) {
        throw new GameError(400, 'INVALID_NAME', 'Chaque nom doit contenir entre 1 et 24 caractères.');
      }
      return name.trim();
    });
    const players = await this.loadPlayers();
    const unique = new Map();
    for (const player of players) {
      if (player.id === undefined || player.id === null || !POSITION_LIMITS[player.position]) continue;
      const id = String(player.id);
      if (!unique.has(id)) unique.set(id, {
        id, name: player.name, photo: player.photo || null, team: player.team,
        nationality: player.nationality, position: player.position,
      });
    }
    const catalog = [...unique.values()];
    for (const [position, quota] of Object.entries(POSITION_LIMITS)) {
      if (catalog.filter(player => player.position === position).length < quota * 2) {
        throw new GameError(502, 'INSUFFICIENT_POSITION_PLAYERS', 'Le catalogue doit contenir au moins 2 gardiens, 4 défenseurs, 4 milieux et 2 attaquants distincts.');
      }
    }
    const game = {
      id: randomUUID(), player1Name: names[0], player2Name: names[1],
      player1Money: 200, player2Money: 200, currentTurn: 1, currentPlayer: 1,
      status: 'active', createdAt: new Date().toISOString(), version: 0,
      teams: { 1: [], 2: [] },
      state: { rulesVersion: 2, catalog, usedIds: [], round: 1, auction: null, lastRound: null, lastAction: null },
    };
    this.startAuction(game);
    this.repository.create(game);
    return this.get(game.id);
  }

  find(id) {
    const game = this.repository.get(id);
    if (!game) throw new GameError(404, 'GAME_NOT_FOUND', 'Cette partie est introuvable.');
    return game;
  }

  get(id) {
    const { state, ...game } = this.find(id);
    const result = gameResult(game.teams);
    const legacy = state.rulesVersion !== 2;
    return {
      ...game, rulesVersion: legacy ? 1 : 2, legacy,
      round: state.round || null, totalRounds: TEAM_SIZE, roundPositions: ROUND_POSITIONS,
      positionLimits: POSITION_LIMITS, teamSize: legacy ? 5 : TEAM_SIZE,
      auction: state.auction || null, lastRound: state.lastRound || null, lastAction: state.lastAction || null,
      teamStructure: { 1: organizeTeam(game.teams[1]), 2: organizeTeam(game.teams[2]) },
      scores: result.scores, result: game.status === 'finished' ? result : null,
    };
  }

  auction(id) {
    const game = this.get(id);
    if (game.legacy) throw new GameError(409, 'LEGACY_GAME', 'Cette ancienne partie est conservée en lecture seule. Créez une nouvelle partie pour les enchères.');
    return { gameId: game.id, auction: game.auction, lastRound: game.lastRound,
      currentPlayer: game.currentPlayer, currentTurn: game.currentTurn, version: game.version, status: game.status };
  }

  team(id, player) {
    if (!['1', '2'].includes(String(player))) throw new GameError(400, 'INVALID_PLAYER', 'Participant invalide.');
    return organizeTeam(this.find(id).teams[player]);
  }

  available(game, position) {
    const used = new Set([...game.state.usedIds, ...game.teams[1].map(p => p.footballPlayerId), ...game.teams[2].map(p => p.footballPlayerId)]);
    return game.state.catalog.filter(player => player.position === position && !used.has(player.id));
  }

  randomPlayer(pool) { return pool[this.pick(pool.length)]; }

  startAuction(game) {
    const round = game.state.round;
    const position = ROUND_POSITIONS[round - 1];
    const available = this.available(game, position);
    if (available.length < 2) {
      throw new GameError(409, 'NO_SAME_POSITION_PLAYER', 'Pas assez de footballeurs distincts pour cette manche.');
    }
    const firstBidder = round % 2 === 1 ? 1 : 2;
    game.currentPlayer = firstBidder;
    game.state.auction = {
      round, position, offeredPlayer: this.randomPlayer(available),
      currentPrice: 0, currentBidder: null, firstBidder, openingPasses: 0, status: 'active',
    };
  }

  act(id, input, action) {
    if (![1, 2].includes(input?.player) || !Number.isInteger(input?.version) || input.version < 0 || typeof input?.playerId !== 'string') {
      throw new GameError(400, 'INVALID_ACTION', 'Le participant, le footballeur et la version de l’enchère sont requis.');
    }
    return this.repository.transaction(() => {
      const game = this.find(id);
      if (game.state.rulesVersion !== 2) throw new GameError(409, 'LEGACY_GAME', 'Cette ancienne partie est en lecture seule.');
      if (game.status !== 'active') throw new GameError(409, 'GAME_FINISHED', 'Cette partie est terminée.');
      if (input.version !== game.version) throw new GameError(409, 'STALE_AUCTION', 'L’enchère a déjà changé. La partie a été actualisée.');
      if (input.player !== game.currentPlayer) throw new GameError(409, 'WRONG_TURN', 'Ce n’est pas votre tour.');
      const auction = game.state.auction;
      if (auction.status !== 'active' || input.playerId !== auction.offeredPlayer.id) {
        throw new GameError(409, 'WRONG_AUCTION', 'Ce footballeur n’est pas celui de l’enchère actuelle.');
      }
      if (action === 'bid') {
        if (!Number.isSafeInteger(input.amount) || input.amount <= auction.currentPrice) {
          throw new GameError(400, 'INVALID_BID', 'Proposez un montant entier d’au moins $' + (auction.currentPrice + 1) + '.');
        }
        if (input.amount > game[budgetKey(input.player)]) throw new GameError(409, 'INSUFFICIENT_FUNDS', 'Votre enchère dépasse votre budget restant.');
        auction.currentPrice = input.amount;
        auction.currentBidder = input.player;
        game.currentPlayer = 3 - input.player;
        game.state.lastAction = { action: 'bid', owner: input.player, amount: input.amount, name: auction.offeredPlayer.name };
      } else if (action === 'pass') {
        game.state.lastAction = { action: 'pass', owner: input.player, name: auction.offeredPlayer.name };
        if (auction.currentBidder !== null) {
          this.finishAuction(game, auction.currentBidder, auction.currentPrice);
        } else {
          auction.openingPasses += 1;
          if (auction.openingPasses === 2) this.finishAuction(game, auction.firstBidder, 0);
          else game.currentPlayer = 3 - input.player;
        }
      } else {
        throw new GameError(400, 'INVALID_ACTION', 'Action invalide.');
      }
      game.version += 1;
      game.currentTurn += 1;
      this.repository.save(game);
      return this.get(id);
    });
  }

  bid(id, input) { return this.act(id, input, 'bid'); }
  pass(id, input) { return this.act(id, input, 'pass'); }

  finishAuction(game, winner, finalPrice) {
    const auction = game.state.auction;
    const sold = auction.offeredPlayer;
    const loser = 3 - winner;
    const pool = this.available(game, auction.position).filter(player => player.id !== sold.id);
    if (!pool.length) throw new GameError(409, 'NO_SAME_POSITION_PLAYER', 'Aucun joueur gratuit du même poste n’est disponible.');
    for (const owner of [1, 2]) {
      const team = game.teams[owner];
      if (team.length !== auction.round - 1 || team.filter(player => player.position === auction.position).length >= POSITION_LIMITS[auction.position]) {
        throw new GameError(409, 'INVALID_TEAM_COMPOSITION', 'La composition de l’équipe ne permet pas cette attribution.');
      }
    }
    if (finalPrice > game[budgetKey(winner)]) throw new GameError(409, 'INSUFFICIENT_FUNDS', 'Le gagnant ne dispose pas du budget nécessaire.');
    const freePlayer = this.randomPlayer(pool);
    // Le paiement et les deux attributions appartiennent à la même transaction.
    this.repository.purchase(game.id, { ...sold, price: finalPrice }, winner);
    this.repository.purchase(game.id, { ...freePlayer, price: 0 }, loser);
    game[budgetKey(winner)] -= finalPrice;
    game.state.usedIds.push(sold.id, freePlayer.id);
    game.teams = { 1: this.repository.team(game.id, 1), 2: this.repository.team(game.id, 2) };
    game.state.lastRound = { ...auction, status: 'finished', winner, loser, finalPrice,
      soldPlayer: { ...sold, price: finalPrice }, freePlayer: { ...freePlayer, price: 0 },
      noBids: auction.currentBidder === null };
    if (auction.round === TEAM_SIZE) {
      for (const owner of [1, 2]) {
        if (game.teams[owner].length !== TEAM_SIZE || Object.entries(POSITION_LIMITS).some(([position, quota]) => game.teams[owner].filter(player => player.position === position).length !== quota)) {
          throw new GameError(409, 'INVALID_TEAM_COMPOSITION', 'Les équipes finales sont incomplètes.');
        }
      }
      game.status = 'finished';
      game.state.auction = game.state.lastRound;
    } else {
      game.state.round += 1;
      this.startAuction(game);
    }
  }
}
