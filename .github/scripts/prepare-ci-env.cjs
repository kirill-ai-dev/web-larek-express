const { readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');

/** Готовит отдельное окружение Docker для CI; секреты живут только в текущем запуске. */
const backend = readFileSync('backend/.env.example', 'utf8')
  .replace(/^DB_ADDRESS=.*$/m, 'DB_ADDRESS=mongodb://root:example@mongo:27017/')
  .replace(/^AUTH_ACCESS_TOKEN_SECRET=.*$/m, `AUTH_ACCESS_TOKEN_SECRET=${randomBytes(48).toString('hex')}`)
  .replace(/^AUTH_REFRESH_TOKEN_SECRET=.*$/m, `AUTH_REFRESH_TOKEN_SECRET=${randomBytes(48).toString('hex')}`);
writeFileSync('backend/.env', backend, { mode: 0o600 });

const frontend = readFileSync('frontend/.env.example', 'utf8')
  .replace(/^VITE_API_ORIGIN=.*$/m, 'VITE_API_ORIGIN=http://localhost/api');
writeFileSync('frontend/.env', frontend, { mode: 0o600 });
