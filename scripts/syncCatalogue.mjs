import { prepareCatalogue } from './refreshCatalogue.mjs';
try { await prepareCatalogue({ useLocalEnv: true }); }
catch (error) { console.error('CATALOGUE_FAILED', error.message); process.exitCode = 1; }
