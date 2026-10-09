import { GameError } from './gameError.js';

const KEY = 'football-games:browser:v1';
const empty = () => ({ version: 1, auctions: {}, careers: {} });
export class BrowserStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.memory = empty();
    this.active = null;
  }
  read() {
    if (this.active) return this.active;
    if (!this.storage) return this.memory;
    let raw;
    try { raw = this.storage.getItem(KEY); }
    catch { this.storage = null; return this.memory; }
    if (!raw) return empty();
    try {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !data.auctions || !data.careers || typeof data.auctions !== 'object'
        || typeof data.careers !== 'object' || Array.isArray(data.auctions) || Array.isArray(data.careers)) throw new Error();
      return data;
    } catch { throw new GameError(409, 'INVALID_LOCAL_SAVE', 'La sauvegarde de cet appareil est illisible. Effacez les données de ce site pour recommencer.'); }
  }
  transaction(action) {
    if (this.active) return action();
    this.active = structuredClone(this.read());
    try {
      const result = action();
      if (this.storage) {
        try { this.storage.setItem(KEY, JSON.stringify(this.active)); }
        catch { throw new GameError(507, 'LOCAL_STORAGE_FULL', 'La sauvegarde est impossible. Libérez de l’espace dans le stockage de ce navigateur.'); }
      }
      this.memory = this.active;
      return result;
    } finally { this.active = null; }
  }
}

export class BrowserGameRepository {
  constructor(store) { this.store = store; }
  transaction(action) { return this.store.transaction(action); }
  create(game) { return this.transaction(() => { this.store.read().auctions[game.id] = structuredClone(game); }); }
  get(id) { const games = this.store.read().auctions; return Object.hasOwn(games, id) ? structuredClone(games[id]) : null; }
  team(id, owner) { return this.get(id)?.teams[owner] || []; }
  save(game) { this.store.read().auctions[game.id] = structuredClone(game); }
  purchase(gameId, player, owner) {
    const game = this.store.read().auctions[gameId];
    if (Object.values(game.teams).flat().some(item => item.footballPlayerId === String(player.id))) {
      throw new GameError(409, 'DUPLICATE_PLAYER', 'Ce joueur a déjà été attribué.');
    }
    game.teams[owner].push({ ...player, id: globalThis.crypto.randomUUID(), gameId, footballPlayerId: String(player.id), owner });
  }
}

export class BrowserCareerRepository {
  constructor(store) { this.store = store; }
  transaction(action) { return this.store.transaction(action); }
  create(game) { return this.transaction(() => { this.store.read().careers[game.id] = { ...structuredClone(game), status: 'PLAYING', isCorrect: null }; }); }
  get(id) { const games = this.store.read().careers; return Object.hasOwn(games, id) ? structuredClone(games[id]) : null; }
  answer(id, answer, correct, answeredAt) {
    const game = this.store.read().careers[id];
    if (!game || game.status !== 'PLAYING') return 0;
    Object.assign(game, { status: 'FINISHED', answer, isCorrect: Number(correct), answeredAt });
    return 1;
  }
}
