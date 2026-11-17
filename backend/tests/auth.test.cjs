const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { spawn } = require('node:child_process');
const { randomBytes, scryptSync } = require('node:crypto');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const accessSecret = randomBytes(32).toString('hex');
const refreshSecret = randomBytes(32).toString('hex');
const database = `weblarek_auth_test_${process.pid}`;
const dbAddress = `mongodb://127.0.0.1:27017/${database}`;
const credentials = { email: 'admin@ya.ru', password: '123456789' };
let server;
let baseUrl;
let User;
let fileSandbox;

function checkPasswordHash(password, stored) {
  const [algorithm, salt, hash] = stored.split(':');
  assert.equal(algorithm, 'scrypt');
  assert.equal(scryptSync(password, salt, 64).toString('hex'), hash);
}

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function cookie(result) {
  return result.headers.get('set-cookie').split(';')[0];
}

async function register(body = credentials) {
  return request('/auth/register', { method: 'POST', body });
}

function assertSession(result, name = 'Ё-мое') {
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.user, { email: credentials.email, name });
  assert.deepEqual(Object.keys(result.body).sort(), ['accessToken', 'success', 'user']);
  const access = jwt.verify(result.body.accessToken, accessSecret);
  const refresh = jwt.verify(cookie(result).slice('refreshToken='.length), refreshSecret);
  for (const payload of [access, refresh]) {
    assert.deepEqual(Object.keys(payload).sort(), ['_id', 'exp', 'iat']);
    assert.match(payload._id, /^[a-f0-9]{24}$/);
  }
  assert.ok(Math.abs(access.exp - access.iat - 600) < 1);
  assert.ok(Math.abs(refresh.exp - refresh.iat - 604800) < 1);
  const header = result.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) {
    assert.ok(header.includes(flag), flag);
  }
  assert.ok(!header.includes('Secure'));
}

before(async () => {
  process.env.AUTH_ACCESS_TOKEN_SECRET = accessSecret;
  fileSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'weblarek-auth-files-'));
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => {
      const chosen = socket.address().port;
      socket.close(() => resolve(chosen));
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['-e',
    "process.on('SIGTERM', () => process.exit(0)); require('./dist/app.js');",
  ], {
    env: {
      ...process.env, PORT: String(port), DB_ADDRESS: dbAddress,
      AUTH_ACCESS_TOKEN_SECRET: accessSecret, AUTH_REFRESH_TOKEN_SECRET: refreshSecret,
      AUTH_ACCESS_TOKEN_EXPIRY: '10m', AUTH_REFRESH_TOKEN_EXPIRY: '7d',
      UPLOAD_PATH: path.join(fileSandbox, 'images'),
      UPLOAD_PATH_TEMP: path.join(fileSandbox, 'temp'),
    },
    stdio: 'pipe',
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await request('/product'); break; } catch {
      if (attempt === 99) throw new Error('Тестовый сервер не запустился');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await mongoose.connect(dbAddress);
  User = require('../dist/models/user').default;
  await User.init();
});

beforeEach(async () => User.deleteMany({}));

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (fileSandbox) fs.rmSync(fileSandbox, { recursive: true, force: true });
});

test('регистрация: стандартное имя, токены, cookie и скрытые поля модели', async () => {
  const result = await register();
  assert.equal(result.status, 201);
  assertSession(result);
  const user = await User.findOne({ email: credentials.email });
  assert.equal(user.password, undefined);
  assert.equal(user.tokens, undefined);
  const stored = await User.findById(user._id).select('+password +tokens');
  assert.notEqual(stored.password, credentials.password);
  checkPasswordHash(credentials.password, stored.password);
  assert.equal(stored.tokens.length, 1);
  assert.equal(stored.tokens[0].token, cookie(result).slice('refreshToken='.length));
});

test('регистрация: переданное имя сохраняется', async () => {
  const result = await register({ ...credentials, name: 'Максим' });
  assertSession(result, 'Максим');
});

test('регистрация: повтор email возвращает 409 с message', async () => {
  await register();
  const result = await register();
  assert.equal(result.status, 409);
  assert.deepEqual(Object.keys(result.body), ['message']);
});

for (const [name, body] of [
  ['без email', { password: '123456789' }],
  ['без пароля', { email: 'admin@ya.ru' }],
  ['неверный email', { ...credentials, email: 'no-email' }],
  ['короткий пароль', { ...credentials, password: '12345' }],
  ['короткое имя', { ...credentials, name: 'Я' }],
  ['длинное имя', { ...credentials, name: 'Я'.repeat(31) }],
  ['пароль числом', { ...credentials, password: 123456789 }],
  ['внедрение условия MongoDB', { ...credentials, email: { $ne: null } }],
]) {
  test(`регистрация: ${name} отклоняется до записи в базу`, async () => {
    const result = await register(body);
    assert.equal(result.status, 400);
    assert.equal(await User.countDocuments(), 0);
  });
}

test('схема проверяет email, пароль и имя без HTTP', async () => {
  for (const body of [
    { ...credentials, email: 'bad' }, { ...credentials, password: '12345' },
    { ...credentials, name: 'Я' }, { ...credentials, name: 'Я'.repeat(31) },
    { email: credentials.email }, { password: credentials.password },
  ]) {
    await assert.rejects(User.create(body), { name: 'ValidationError' });
  }
  const user = await User.create(credentials);
  assert.equal(user.name, 'Ё-мое');
  checkPasswordHash(credentials.password, user.password);
});

test('модель проверяет email регулярным выражением без HTTP', async () => {
  for (const email of ['admin@', '@ya.ru', 'admin@-ya.ru', 'admin@ya..ru', 'a b@ya.ru',
    '.admin@ya.ru', 'admin.@ya.ru', 'a..b@ya.ru']) {
    await assert.rejects(User.create({ ...credentials, email }), { name: 'ValidationError' });
  }
  const user = await User.create({ ...credentials, email: 'admin+shop@mail.example.ru' });
  assert.equal(user.email, 'admin+shop@mail.example.ru');
});

test('auth передаёт проверенный payload в req.user', async () => {
  const auth = require('../dist/middlewares/auth').default;
  const payload = { _id: new mongoose.Types.ObjectId().toString() };
  const token = jwt.sign(payload, accessSecret, { expiresIn: '10m' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let error;
  let calls = 0;
  auth(req, { locals: {} }, (value) => { error = value; calls += 1; });
  assert.equal(error, undefined);
  assert.equal(calls, 1);
  assert.deepEqual(req.user, jwt.verify(token, accessSecret));
});

test('вход: верный пароль выдаёт сессию', async () => {
  await register();
  const result = await request('/auth/login', { method: 'POST', body: credentials });
  assert.equal(result.status, 200);
  assertSession(result);
});

test('вход: неверный пароль и неизвестный email возвращают 401', async () => {
  await register();
  for (const body of [
    { ...credentials, password: 'wrong-password' },
    { ...credentials, email: 'missing@ya.ru' },
  ]) {
    const result = await request('/auth/login', { method: 'POST', body });
    assert.equal(result.status, 401);
    assert.deepEqual(Object.keys(result.body), ['message']);
  }
});

test('длинные пароли с одинаковыми первыми 72 байтами различаются', async () => {
  const prefix = 'a'.repeat(72);
  const password = `${prefix}-one`;
  await register({ ...credentials, password });
  const invalid = await request('/auth/login', {
    method: 'POST', body: { ...credentials, password: `${prefix}-two` },
  });
  assert.equal(invalid.status, 401);
  const valid = await request('/auth/login', { method: 'POST', body: { ...credentials, password } });
  assert.equal(valid.status, 200);
});

test('профиль доступен по access-токену', async () => {
  const session = await register();
  const result = await request('/auth/user', {
    headers: { Authorization: `Bearer ${session.body.accessToken}` },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { user: { email: credentials.email, name: 'Ё-мое' }, success: true });
});

test('профиль: без токена, неверный и просроченный токен дают 401', async () => {
  for (const authorization of ['', 'Bearer broken', 'Basic secret', `Bearer ${jwt.sign(
    { _id: new mongoose.Types.ObjectId().toString() }, accessSecret, { expiresIn: -1 },
  )}`]) {
    const result = await request('/auth/user', { headers: { Authorization: authorization } });
    assert.equal(result.status, 401);
  }
});

test('профиль: валидный токен удалённого пользователя даёт 404', async () => {
  const session = await register();
  await User.deleteMany({});
  const result = await request('/auth/user', {
    headers: { Authorization: `Bearer ${session.body.accessToken}` },
  });
  assert.equal(result.status, 404);
});

test('обновление заменяет refresh-токен и запрещает его повторное использование', async () => {
  const session = await register();
  const oldCookie = cookie(session);
  const result = await request('/auth/token', { headers: { Cookie: oldCookie } });
  assert.equal(result.status, 200);
  assertSession(result);
  assert.notEqual(cookie(result), oldCookie);
  assert.equal((await request('/auth/token', { headers: { Cookie: oldCookie } })).status, 401);
});

test('обновление: нет cookie, неверный, просроченный и не сохранённый токены дают 401', async () => {
  const session = await register();
  const payload = jwt.verify(session.body.accessToken, accessSecret);
  for (const token of ['', 'broken', jwt.sign(
    { _id: new mongoose.Types.ObjectId().toString() }, refreshSecret, { expiresIn: -1 },
  ), jwt.sign({ _id: payload._id }, refreshSecret, { expiresIn: '7d' })]) {
    const result = await request('/auth/token', { headers: { Cookie: `refreshToken=${token}` } });
    assert.equal(result.status, 401);
  }
});

test('обновление: действительный refresh-токен удалённого пользователя даёт 404', async () => {
  const session = await register();
  await User.deleteMany({});
  const result = await request('/auth/token', { headers: { Cookie: cookie(session) } });
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { message: 'Пользователь не найден' });
});

test('токены разных типов нельзя подменять друг другом', async () => {
  const session = await register();
  assert.equal((await request('/auth/user', {
    headers: { Authorization: `Bearer ${cookie(session).slice('refreshToken='.length)}` },
  })).status, 401);
  assert.equal((await request('/auth/token', {
    headers: { Cookie: `refreshToken=${session.body.accessToken}` },
  })).status, 401);
});

test('выход удаляет текущую сессию, очищает cookie и сохраняет другие сессии', async () => {
  const first = await register();
  const second = await request('/auth/login', { method: 'POST', body: credentials });
  const result = await request('/auth/logout', { headers: { Cookie: cookie(first) } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true });
  assert.ok(result.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
  assert.equal((await request('/auth/token', { headers: { Cookie: cookie(first) } })).status, 401);
  assert.equal((await request('/auth/token', { headers: { Cookie: cookie(second) } })).status, 200);
});

test('выход: невалидный ID даёт 400, неизвестный пользователь — 404', async () => {
  for (const [id, status] of [['bad-id', 400], [new mongoose.Types.ObjectId().toString(), 404]]) {
    const token = jwt.sign({ _id: id }, refreshSecret, { expiresIn: '7d' });
    const result = await request('/auth/logout', { headers: { Cookie: `refreshToken=${token}` } });
    assert.equal(result.status, status);
  }
});

test('CORS разрешает фронтенду передавать cookie', async () => {
  const result = await request('/product', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(result.headers.get('access-control-allow-credentials'), 'true');
});

test('пустой запрос на вход отклоняется до контроллера', async () => {
  const result = await request('/auth/login', { method: 'POST', body: {} });
  assert.equal(result.status, 400);
});

test('один refresh-токен нельзя обновить двумя параллельными запросами', async () => {
  const session = await register();
  const results = await Promise.all([1, 2].map(() => request('/auth/token', {
    headers: { Cookie: cookie(session) },
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
});

test('выход без cookie и с повреждённым токеном даёт 401', async () => {
  for (const header of ['', 'refreshToken=broken']) {
    assert.equal((await request('/auth/logout', { headers: { Cookie: header } })).status, 401);
  }
});

test('access-токен без ID или срока, с чужой подписью и алгоритмом отклоняется', async () => {
  const id = new mongoose.Types.ObjectId().toString();
  for (const token of [
    jwt.sign({}, accessSecret, { expiresIn: '10m' }),
    jwt.sign({ _id: 'bad-id' }, accessSecret, { expiresIn: '10m' }),
    jwt.sign({ _id: id }, accessSecret),
    jwt.sign({ _id: id }, 'other-secret', { expiresIn: '10m' }),
    jwt.sign({ _id: id }, accessSecret, { algorithm: 'HS384', expiresIn: '10m' }),
  ]) {
    assert.equal((await request('/auth/user', {
      headers: { Authorization: `Bearer ${token}` },
    })).status, 401);
  }
});

test('refresh-токен с неверным ID возвращает 401', async () => {
  const token = jwt.sign({ _id: 'bad-id' }, refreshSecret, { expiresIn: '7d' });
  assert.equal((await request('/auth/token', {
    headers: { Cookie: `refreshToken=${token}` },
  })).status, 401);
});

test('пароль, заголовок Authorization и cookie не попадают в логи', async () => {
  const marker = `sensitive-${randomBytes(10).toString('hex')}`;
  await request('/auth/login', {
    method: 'POST', body: { email: marker, password: marker },
    headers: { Cookie: `refreshToken=${marker}`, Authorization: `Bearer ${marker}` },
  });
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: `{ "password": "${marker}", `,
  });
  assert.equal(response.status, 400);
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const filename of ['request.log', 'error.log']) {
    assert.ok(!fs.readFileSync(filename, 'utf8').includes(marker), filename);
  }
});
