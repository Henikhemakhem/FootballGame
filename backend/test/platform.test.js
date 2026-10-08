import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openDatabase } from '../src/models/database.js';
import { PlayerCareerRepository } from '../src/models/playerCareerRepository.js';
import { PlayerCareerGameService } from '../src/services/playerCareerGameService.js';

test('React : menu, parcours sans identité, échec/révélation, nouvelle partie et succès', async t => {
  const vite = await createServer({ root: fileURLToPath(new URL('../../frontend/', import.meta.url)),
    server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => vite.close());
  const http = createHttpServer((req, res) => vite.middlewares(req, res, () => { res.statusCode = 404; res.end(); }));
  http.listen(0, '127.0.0.1');
  await new Promise(resolve => http.once('listening', resolve));
  t.after(() => new Promise(resolve => http.close(resolve)));
  const privateFile = fileURLToPath(new URL('../src/data/mockCareers.js', import.meta.url)).replaceAll('\\', '/');
  const privateResponse = await fetch('http://127.0.0.1:' + http.address().port + '/@fs/' + privateFile);
  assert.equal(privateResponse.status, 403);
  assert.ok(!(await privateResponse.text()).includes('histories ='));
  // npm crée aussi une jonction node_modules/backend : elle doit rester privée.
  const linkedFile = fileURLToPath(new URL('../../node_modules/backend/src/data/mockCareers.js', import.meta.url)).replaceAll('\\', '/');
  const linkedResponse = await fetch('http://127.0.0.1:' + http.address().port + '/@fs/' + linkedFile);
  assert.equal(linkedResponse.status, 403);
  const { default: GameSelection } = await vite.ssrLoadModule('/src/pages/GameSelection.jsx');
  const { routeFromHash } = await vite.ssrLoadModule('/src/App.jsx');
  const { CareerSetup, CareerRound, CareerResult } = await vite.ssrLoadModule('/src/components/PlayerCareerViews.jsx');
  const render = (component, props) => renderToStaticMarkup(createElement(component, props));
  const menu = render(GameSelection);
  assert.match(menu, /Jeu des enchères/);
  assert.match(menu, /Parcours du joueur/);
  assert.match(menu, /href="#\/encheres"/);
  assert.match(menu, /href="#\/parcours"/);
  assert.equal(routeFromHash(''), 'home');
  assert.equal(routeFromHash('#/parcours'), 'career');
  assert.equal(routeFromHash('#/encheres'), 'auction');
  assert.match(render(CareerSetup, { difficulty: 'medium', busy: false }), /Nouvelle partie/);

  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const career = [{ club: 'Alpha', from: '2000', to: '2005' }, { club: 'Beta', from: '2005', to: '2010' }, { club: 'Gamma', from: '2010', to: null }];
  const service = new PlayerCareerGameService(new PlayerCareerRepository(db), { pick: () => 0, football: {
    getCareerCandidates: async () => [
      { id: 'secret-one', name: 'Premier Joueur', photo: 'https://example.com/secret-one.png' },
      { id: 'secret-two', name: 'Deuxième Joueur', photo: 'https://example.com/secret-two.png' },
    ], getPlayerCareer: async () => career,
  } });
  const game = await service.start({ difficulty: 'medium' });
  const playing = render(CareerRound, { game, answer: '', busy: false });
  assert.match(playing, /Alpha/);
  assert.match(playing, /Quel est ce joueur/);
  assert.ok(!playing.includes('Premier Joueur'));
  assert.ok(!playing.includes('secret-one'));
  assert.ok(!playing.includes('<img'));
  assert.match(playing, /<button(?=[^>]*\btype="submit")(?=[^>]*\bdisabled="")[^>]*>/);
  const failure = service.answer(game.gameId, { answer: 'Mauvais nom' });
  const failedView = render(CareerResult, { game: failure, difficulty: 'medium', busy: false });
  assert.match(failedView, /Tu as échoué !/);
  assert.match(failedView, /Premier Joueur/);
  assert.match(failedView, /<img/);
  assert.ok(!failedView.includes('answer-form'));
  const next = await service.start({ previousGameId: game.gameId });
  const success = service.answer(next.gameId, { answer: ' deuxieme   joueur ' });
  const succeededView = render(CareerResult, { game: success, difficulty: 'medium', busy: false });
  assert.match(succeededView, /Bonne réponse !/);
  assert.match(succeededView, /Deuxième Joueur/);
  assert.match(succeededView, /Nouvelle partie/);
});
