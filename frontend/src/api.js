export async function request(path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(path === '/player-career/start' ? 60000 : path === '/games' ? 45000 : 15000),
    });
  } catch {
    throw new Error('Connexion au serveur impossible. Vérifiez qu’il est démarré, puis réessayez.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Le serveur a envoyé une réponse inattendue.'); }
  if (!response.ok) {
    const error = new Error(data.error?.message || 'La demande a échoué.');
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
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
