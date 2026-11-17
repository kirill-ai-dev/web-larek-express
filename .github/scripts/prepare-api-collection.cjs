const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');

/** Ждёт готовности API за nginx, а не только открытия порта контейнера. */
async function waitForApi(baseUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/product`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch {}
    await setTimeout(1000);
  }
  throw new Error('API не запустилось за отведённое время');
}

/**
 * Подготавливает базовую коллекцию к шагам 7–8: получает токен и загружает картинку.
 * Все запросы, ожидаемые статусы и проверки ответа из коллекции Практикума сохраняются.
 * Меняются только Authorization и путь к предварительно загруженному файлу.
 */
async function main() {
  const [, , source, target, baseUrl = 'http://localhost/api'] = process.argv;
  assert.ok(source && target, 'Укажите исходную коллекцию и путь к подготовленной копии');
  const collection = JSON.parse(readFileSync(source, 'utf8'));
  await waitForApi(baseUrl);

  const unauthenticated = await fetch(`${baseUrl}/product`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(unauthenticated.status, 401, 'Создание товара должно требовать авторизацию');

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `ci-${randomUUID()}@example.com`, password: randomUUID() }),
  });
  assert.equal(registration.status, 201, 'Не удалось зарегистрировать тестового пользователя');
  const { accessToken } = await registration.json();
  assert.equal(typeof accessToken, 'string');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const form = new FormData();
  form.append('file', new Blob([readFileSync('backend/src/public/images/5_Dots.png')], {
    type: 'image/png',
  }), 'image.png');
  const upload = await fetch(`${baseUrl}/upload`, { method: 'POST', headers, body: form });
  assert.equal(upload.status, 200, 'Не удалось загрузить тестовую картинку');
  const image = await upload.json();
  assert.match(image.fileName, /^\/images\/[a-f\d-]+\.png$/i);

  /** Добавляет токен только к созданию товара, сохраняя публичность остальных запросов. */
  function prepareItems(items) {
    for (const item of items) {
      if (item.item) prepareItems(item.item);
      else if (item.request.method === 'POST' && item.request.url.path.includes('product')) {
        item.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: accessToken, type: 'string' }] };
        if (item.request.body?.raw) {
          item.request.body.raw = item.request.body.raw.replaceAll('/images/image.png', image.fileName);
        }
      }
    }
  }
  prepareItems(collection.item);
  const urlVariable = collection.variable.find((variable) => variable.key === 'baseUrl');
  assert.ok(urlVariable, 'В коллекции нет переменной baseUrl');
  urlVariable.value = baseUrl;
  writeFileSync(target, JSON.stringify(collection, null, 2), { mode: 0o600 });
  console.log('Для исходной коллекции подготовлены авторизация и настоящая картинка. Проверки сохранены.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
