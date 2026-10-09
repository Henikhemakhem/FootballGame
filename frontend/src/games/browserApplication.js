import { GameService } from './gameService.js';
import { PlayerCareerGameService } from './playerCareerGameService.js';
import { BrowserStore, BrowserGameRepository, BrowserCareerRepository } from './browserRepository.js';
import { BrowserCatalogue } from './catalogue.js';
import { GameError } from './gameError.js';

export function createBrowserApplication(data, storage) {
  const catalogue = new BrowserCatalogue(data);
  const store = new BrowserStore(storage);
  const games = new GameService(new BrowserGameRepository(store), { loadPlayers: () => catalogue.getPlayers() });
  const careers = new PlayerCareerGameService(new BrowserCareerRepository(store), { football: catalogue });
  const dispatch = async (path, body) => {
    const url = new URL(path, 'https://local.invalid');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'health' && body === undefined) return { status: 'ok', dataMode: 'api-static', localCounts: catalogue.counts(), updatedAt: data.updatedAt };
    if (parts[0] === 'players' && body === undefined) return catalogue.getPlayers(url.searchParams.get('position'));
    if (parts[0] === 'games') {
      if (parts.length === 1 && body !== undefined) return games.create(body);
      if (parts.length === 2 && body === undefined) return games.get(parts[1]);
      if (parts[2] === 'auction' && body === undefined) return games.auction(parts[1]);
      if (parts[2] === 'team' && body === undefined) return games.team(parts[1], parts[3]);
      if (parts[2] === 'bid' && body !== undefined) return games.bid(parts[1], body);
      if (parts[2] === 'pass' && body !== undefined) return games.pass(parts[1], body);
    }
    if (parts[0] === 'player-career') {
      if (parts[1] === 'start' && body !== undefined) return careers.start(body);
      if (parts.length === 2 && body === undefined) return careers.get(parts[1]);
      if (parts[2] === 'answer' && body !== undefined) return careers.answer(parts[1], body);
    }
    throw new GameError(404, 'ROUTE_NOT_FOUND', 'Cette action est introuvable.');
  };
  return async (path, body) => {
    // Serialize mutations across tabs on browsers supporting Web Locks.
    if (globalThis.navigator?.locks) return navigator.locks.request('football-games:browser', () => dispatch(path, body));
    return dispatch(path, body);
  };
}
