export function netlifyRedirects(backendUrl) {
  let url;
  try { url = new URL(backendUrl); }
  catch { throw new Error('Renseignez BACKEND_URL avec l’URL HTTPS publique du backend Render.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('BACKEND_URL doit être une origine HTTPS, sans identifiants, chemin, paramètres ni fragment.');
  }
  return '/api/* ' + url.origin + '/api/:splat 200!\n/* /index.html 200\n';
}
