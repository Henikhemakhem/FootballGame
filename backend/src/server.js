import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`Football Games : http://${config.host}:${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      app.locals.database?.close();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Le port ${config.port} est déjà utilisé.` : 'Impossible de démarrer le serveur.');
  app.locals.database?.close();
  process.exit(1);
});
