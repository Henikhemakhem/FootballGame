import { mockPlayers } from './mockPlayers.js';

// Échantillon de démonstration côté serveur, figé fin 2024. Le mode API sélectionne
// ses candidats automatiquement : cette liste ne filtre jamais les joueurs réels.
const histories = {
  'demo-1': [
    ['FC Bâle', '2012', '2014'], ['Chelsea', '2014', '2015'],
    ['Fiorentina', '2015', '2015'], ['AS Roma', '2015', '2017'], ['Liverpool', '2017', '2024'],
  ],
  'demo-12': [
    ['KRC Genk', '2008', '2012'], ['Chelsea', '2012', '2012'],
    ['Werder Brême', '2012', '2013'], ['Chelsea', '2013', '2014'],
    ['VfL Wolfsburg', '2014', '2015'], ['Manchester City', '2015', '2024'],
  ],
  'demo-11': [
    ['Birmingham City', '2019', '2020'], ['Borussia Dortmund', '2020', '2023'], ['Real Madrid', '2023', '2024'],
  ],
  'demo-19': [
    ['FC Groningen', '2011', '2013'], ['Celtic', '2013', '2015'],
    ['Southampton', '2015', '2018'], ['Liverpool', '2018', '2024'],
  ],
};

export const mockCareers = mockPlayers.filter(player => histories[player.id]).map(player => ({
  id: player.id, name: player.name, photo: player.photo, source: 'mock',
  dataNote: 'Parcours de démonstration arrêté fin 2024 ; les prêts et retours sont inclus.',
  career: histories[player.id].map(([club, from, to]) => ({ club, from, to })),
}));
