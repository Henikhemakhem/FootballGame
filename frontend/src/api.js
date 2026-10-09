import { createBrowserApplication } from './games/browserApplication.js';
let application;
async function loadApplication() {
  let response;
  try { response = await fetch('/players.json', { signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Impossible de charger les joueurs. Vérifiez votre connexion puis réessayez.'); }
  if (!response.ok) throw new Error('Le catalogue de joueurs est indisponible.');
  const data = await response.json();
  let storage;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  return createBrowserApplication(data, storage);
}
export async function request(path, body) {
  if (!application) application = loadApplication().catch(error => { application = null; throw error; });
  return (await application)(path, body);
}

const storageKey = 'football-draft:last-game';
export function savedGame() {
  try { return localStorage.getItem(storageKey); } catch { return null; }
}
export function saveGame(id) {
  try { id ? localStorage.setItem(storageKey, id) : localStorage.removeItem(storageKey); } catch { /* Le jeu reste jouable sans stockage navigateur. */ }
}

const careerStorageKey = 'football-games:last-career-game';
export function savedCareerGame() {
  try { return localStorage.getItem(careerStorageKey); } catch { return null; }
}
export function saveCareerGame(id) {
  try { id ? localStorage.setItem(careerStorageKey, id) : localStorage.removeItem(careerStorageKey); } catch { /* Jouable sans stockage navigateur. */ }
}
