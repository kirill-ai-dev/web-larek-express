const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

let server;
let baseUrl;
let sandbox;
let imageDirectory;
let tempDirectory;
let token;
let Product;
let png;
const database = `weblarek_products_test_${process.pid}`;
const dbAddress = `mongodb://127.0.0.1:27017/${database}`;
const accessSecret = randomBytes(32).toString('hex');
const refreshSecret = randomBytes(32).toString('hex');

async function request(route, options = {}) {
  const { authenticated = true, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${route}`, {
    ...fetchOptions,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body instanceof FormData ? options.body
      : options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function upload(data = png, name = '5_Dots.png', type = 'image/png', key = 'file') {
  const form = new FormData();
  form.append(key, new Blob([data], { type }), name);
  return request('/upload', { method: 'POST', body: form });
}

function productBody(image, title = 'Новый товар') {
  return { title, image, category: 'софт-скил', description: 'Описание товара', price: 1000 };
}

async function createProduct(title) {
  const image = await upload();
  assert.equal(image.status, 200);
  const result = await request('/product', { method: 'POST', body: productBody(image.body, title) });
  assert.equal(result.status, 201);
  return result.body;
}

before(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'weblarek-products-'));
  imageDirectory = path.join(sandbox, 'images');
  tempDirectory = path.join(sandbox, 'temp');
  process.env.UPLOAD_PATH = imageDirectory;
  process.env.UPLOAD_PATH_TEMP = tempDirectory;
  png = await fs.readFile(path.join(__dirname, '../src/public/images/5_Dots.png'));
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => {
      const selected = socket.address().port;
      socket.close(() => resolve(selected));
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  let output = '';
  server = spawn(process.execPath, ['-e',
    "process.on('SIGTERM', () => process.exit(0)); require('./dist/app.js');",
  ], {
    env: { ...process.env, PORT: String(port), DB_ADDRESS: dbAddress,
      AUTH_ACCESS_TOKEN_SECRET: accessSecret,
      AUTH_REFRESH_TOKEN_SECRET: refreshSecret },
    stdio: 'pipe',
  });
  server.stderr.on('data', (chunk) => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await request('/product');
      if (result.status === 200) break;
    } catch {}
    if (attempt === 99 || server.exitCode !== null) throw new Error(output || 'Сервер не запустился');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mongoose.connect(dbAddress);
  Product = require('../dist/models/product').default;
  await Product.init();
  const session = await request('/auth/register', {
    method: 'POST', body: { email: 'products@ya.ru', password: '123456789' },
  });
  assert.equal(session.status, 201);
  token = session.body.accessToken;
});

beforeEach(async () => {
  await Product.deleteMany({});
  for (const folder of [imageDirectory, tempDirectory]) {
    await fs.mkdir(folder, { recursive: true });
    for (const file of await fs.readdir(folder)) {
      await fs.rm(path.join(folder, file), { recursive: true, force: true });
    }
  }
});

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    await exit;
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
});

// Каждый защищённый маршрут проверяем до контроллера: данные и файлы не меняются.
for (const [method, route] of [
  ['POST', '/product'], ['PATCH', '/product/:id'], ['DELETE', '/product/:id'],
  ['GET', '/auth/user'], ['POST', '/upload'],
]) {
  test(`${method} ${route}: без access-токена и с неподходящим токеном возвращает 401`, async () => {
    const product = await createProduct();
    const url = route.replace(':id', product._id);
    const storedProduct = JSON.stringify(await Product.findById(product._id).lean());
    const userId = new mongoose.Types.ObjectId().toString();
    for (const authorization of [
      undefined, '', 'Bearer broken', 'Basic secret',
      `Bearer ${jwt.sign({ _id: userId }, accessSecret, { expiresIn: -1 })}`,
      `Bearer ${jwt.sign({ _id: userId }, 'wrong-secret', { expiresIn: '10m' })}`,
      `Bearer ${jwt.sign({ _id: userId }, refreshSecret, { expiresIn: '7d' })}`,
    ]) {
      let body;
      if (route === '/upload') {
        body = new FormData();
        body.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
      } else if (method === 'POST') {
        body = productBody(product.image, 'Неавторизованный товар');
      } else if (method === 'PATCH') {
        body = { title: 'Неавторизованное изменение' };
      }
      const result = await request(url, {
        method, body, authenticated: false,
        headers: authorization === undefined ? {} : { Authorization: authorization },
      });
      assert.equal(result.status, 401);
      assert.deepEqual(Object.keys(result.body), ['message']);
      assert.equal(typeof result.body.message, 'string');
    }
    assert.equal(await Product.countDocuments(), 1);
    assert.equal(JSON.stringify(await Product.findById(product._id).lean()), storedProduct);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
    assert.deepEqual(await fs.readdir(imageDirectory), [path.basename(product.image.fileName)]);
  });
}

test('авторизация проверяется до схемы товара, ID и обработки формы загрузки', async () => {
  for (const [method, route] of [
    ['POST', '/product'], ['PATCH', '/product/bad-id'],
    ['DELETE', '/product/bad-id'], ['POST', '/upload'],
  ]) {
    const result = await request(route, {
      method, authenticated: false, ...(method !== 'DELETE' ? { body: {} } : {}),
    });
    assert.equal(result.status, 401);
  }
});

test('каталог, картинки и создание заказа доступны без авторизации', async () => {
  const product = await createProduct();
  const catalog = await request('/product', { authenticated: false });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.items[0]._id, product._id);
  assert.equal((await fetch(`${baseUrl}${product.image.fileName}`)).status, 200);
  const order = await request('/order', {
    method: 'POST', authenticated: false,
    body: { payment: 'card', email: 'customer@ya.ru', phone: '+79990000000',
      address: 'Москва', total: product.price, items: [product._id] },
  });
  assert.equal(order.status, 200);
  assert.equal(order.body.total, product.price);
});

test('upload сохраняет PNG только во временную папку с уникальным серверным именем', async () => {
  const first = await upload();
  const second = await upload();
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), ['fileName', 'originalName']);
  assert.equal(first.body.originalName, '5_Dots.png');
  assert.match(first.body.fileName, /^\/images\/[a-f\d-]{36}\.png$/);
  assert.notEqual(first.body.fileName, second.body.fileName);
  assert.deepEqual(await fs.readFile(path.join(tempDirectory, path.basename(first.body.fileName))), png);
  assert.deepEqual(await fs.readdir(imageDirectory), []);
  assert.equal((await fetch(`${baseUrl}${first.body.fileName}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/temp/${path.basename(first.body.fileName)}`)).status, 404);
});

test('после создания товар и его изображение доступны, временный файл удалён', async () => {
  const product = await createProduct();
  const result = await fetch(`${baseUrl}${product.image.fileName}`);
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
  assert.deepEqual(await fs.readdir(tempDirectory), []);
  assert.equal(await Product.countDocuments(), 1);
});

test('upload принимает JPEG и выбирает расширение на сервере', async () => {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=', 'base64');
  const result = await upload(jpeg, 'file.jpeg', 'image/jpeg');
  assert.equal(result.status, 200);
  assert.match(result.body.fileName, /\.jpg$/);
});

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
  + '<defs><path id="shape" d="M0 0h10v10z"/></defs><use href="#shape"/></svg>';

for (const [type, data, extension] of [
  ['image/jpg', Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex'), 'jpg'],
  ['image/gif', gif, 'gif'],
  ['image/gif', Buffer.concat([Buffer.from('GIF87a'), gif.subarray(6)]), 'gif'],
  ['image/svg+xml', Buffer.from(svg), 'svg'],
]) {
  test(`upload: ${type} / ${data.subarray(0, 6).toString('hex')} проходит весь цикл товара`, async () => {
    const image = await upload(data, 'client-name.txt', type);
    assert.equal(image.status, 200);
    assert.ok(image.body.fileName.endsWith(`.${extension}`));
    const created = await request('/product', { method: 'POST', body: productBody(image.body) });
    assert.equal(created.status, 201);
    const response = await fetch(`${baseUrl}${image.body.fileName}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
    assert.equal((await request(`/product/${created.body._id}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
    assert.deepEqual(await fs.readdir(imageDirectory), []);
  });
}

test('загружаются SVG из стартового набора с фильтрами', async () => {
  const folder = path.join(__dirname, '../src/public/images');
  for (const filename of (await fs.readdir(folder)).filter((name) => name.endsWith('.svg'))) {
    const content = await fs.readFile(path.join(folder, filename));
    assert.equal((await upload(content, filename, 'image/svg+xml')).status, 200, filename);
  }
});

test('PATCH заменяет PNG на SVG и GIF и удаляет прежние файлы', async () => {
  const product = await createProduct();
  let previous = product.image;
  for (const [content, type] of [[Buffer.from(svg), 'image/svg+xml'], [gif, 'image/gif']]) {
    const image = await upload(content, 'image', type);
    assert.equal(image.status, 200);
    const result = await request(`/product/${product._id}`, {
      method: 'PATCH', body: { image: image.body },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.image, image.body);
    assert.equal((await fetch(`${baseUrl}${image.body.fileName}`)).status, 200);
    assert.equal((await fetch(`${baseUrl}${previous.fileName}`)).status, 404);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
    previous = image.body;
  }
});

for (const [name, content] of [
  ['скрипт', '<svg><script>alert(1)</script></svg>'],
  ['обработчик события', '<svg onload="alert(1)"/>'],
  ['внешняя ссылка', '<svg><use href="https://example.com/image.svg#id"/></svg>'],
  ['ссылка с сущностями', '<svg><use href="&#106;avascript:alert(1)"/></svg>'],
  ['foreignObject', '<svg><foreignObject><div/></foreignObject></svg>'],
  ['анимация ссылки', '<svg><set attributeName="href" to="https://example.com"/></svg>'],
  ['CSS', '<svg><style>@import "https://example.com/style.css";</style></svg>'],
  ['внешний URL в атрибуте', '<svg><path fill="url(https://example.com/x.svg#id)"/></svg>'],
  ['инструкция XML', '<?xml-stylesheet href="https://example.com/style.css"?><svg/>'],
  ['DOCTYPE', '<!DOCTYPE svg [<!ENTITY x "text">]><svg>&x;</svg>'],
  ['повреждённый XML', '<svg><path></svg>'],
  ['чужое пространство имён', '<svg xmlns="http://www.w3.org/1999/xhtml"/>'],
]) {
  test(`upload SVG: ${name} отклоняется и файл удаляется`, async () => {
    const result = await upload(Buffer.from(content), 'image.svg', 'image/svg+xml');
    assert.equal(result.status, 400);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
  });
}

for (const type of ['image/jpg', 'image/gif', 'image/svg+xml']) {
  test(`upload ${type}: текст с поддельным MIME отклоняется`, async () => {
    assert.equal((await upload(Buffer.from('not an image'), 'image', type)).status, 400);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
  });
}

test('cron удаляет старые GIF и SVG из временной папки', async () => {
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const files = [];
  for (const [content, type] of [[gif, 'image/gif'], [Buffer.from(svg), 'image/svg+xml']]) {
    const image = await upload(content, 'image', type);
    assert.equal(image.status, 200);
    const filename = path.join(tempDirectory, path.basename(image.body.fileName));
    files.push(filename);
    await fs.utimes(filename, old, old);
  }
  await require('../dist/utils/files').cleanupTemporaryFiles();
  for (const filename of files) await assert.rejects(fs.access(filename), { code: 'ENOENT' });
});

for (const [name, data, type, key] of [
  ['неразрешённый тип', Buffer.from('text'), 'text/plain', 'file'],
  ['текст с MIME PNG', Buffer.from('text'), 'image/png', 'file'],
  ['пустой файл', Buffer.alloc(0), 'image/png', 'file'],
  ['неверный ключ формы', Buffer.from('text'), 'image/png', 'picture'],
  ['размер больше 5 МБ', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'file'],
]) {
  test(`upload: ${name} отклоняется и не оставляет файл`, async () => {
    const result = await upload(data, 'file.png', type, key);
    assert.equal(result.status, 400);
    assert.deepEqual(Object.keys(result.body), ['message']);
    assert.deepEqual(await fs.readdir(tempDirectory), []);
  });
}

test('upload без файла и с двумя файлами возвращает 400', async () => {
  assert.equal((await request('/upload', { method: 'POST', body: new FormData() })).status, 400);
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'one.png');
  form.append('file', new Blob([png], { type: 'image/png' }), 'two.png');
  assert.equal((await request('/upload', { method: 'POST', body: form })).status, 400);
  assert.deepEqual(await fs.readdir(tempDirectory), []);
});

test('PATCH меняет только переданные поля и возвращает обновлённый товар', async () => {
  const product = await createProduct();
  const result = await request(`/product/${product._id}`, {
    method: 'PATCH', body: { title: 'Обновлённый товар', price: null },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.title, 'Обновлённый товар');
  assert.equal(result.body.price, null);
  assert.deepEqual(result.body.image, product.image);
  assert.equal(result.body.description, product.description);
});

test('PATCH переносит новую картинку и убирает старую без ссылок на неё', async () => {
  const product = await createProduct();
  const image = await upload();
  const result = await request(`/product/${product._id}`, { method: 'PATCH', body: { image: image.body } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.image, image.body);
  assert.equal((await fetch(`${baseUrl}${image.body.fileName}`)).status, 200);
  assert.equal((await fetch(`${baseUrl}${product.image.fileName}`)).status, 404);
  assert.deepEqual(await fs.readdir(tempDirectory), []);
});

test('DELETE возвращает удалённый товар и запускает очистку изображения', async () => {
  const product = await createProduct();
  const result = await request(`/product/${product._id}`, { method: 'DELETE' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, product);
  assert.equal(await Product.countDocuments(), 0);
  assert.deepEqual(await fs.readdir(imageDirectory), []);
});

test('триггер удаления модели очищает файл без вызова HTTP-контроллера', async () => {
  const product = await createProduct();
  await Product.findByIdAndDelete(product._id);
  assert.deepEqual(await fs.readdir(imageDirectory), []);
});

test('общая картинка остаётся, пока на неё ссылается хотя бы один товар', async () => {
  const first = await createProduct('Первый товар');
  const second = await request('/product', {
    method: 'POST', body: productBody(first.image, 'Второй товар'),
  });
  assert.equal(second.status, 201);
  assert.equal((await request(`/product/${first._id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${baseUrl}${first.image.fileName}`)).status, 200);
  await request(`/product/${second.body._id}`, { method: 'DELETE' });
  assert.equal((await fetch(`${baseUrl}${first.image.fileName}`)).status, 404);
});

for (const method of ['PATCH', 'DELETE']) {
  test(`${method}: некорректный ID даёт 400, неизвестный — 404`, async () => {
    const options = { method, ...(method === 'PATCH' ? { body: { price: 10 } } : {}) };
    assert.equal((await request('/product/bad-id', options)).status, 400);
    assert.equal((await request(`/product/${new mongoose.Types.ObjectId()}`, options)).status, 404);
  });
}

test('PATCH отклоняет пустой объект, неверные поля и операторы MongoDB', async () => {
  const product = await createProduct();
  for (const body of [{}, { title: 'Я' }, { title: 'Я'.repeat(31) }, { price: 'не число' },
    { image: {} }, { $set: { title: 'Внедрение' } }, { _id: new mongoose.Types.ObjectId() }]) {
    assert.equal((await request(`/product/${product._id}`, { method: 'PATCH', body })).status, 400);
  }
  assert.equal((await Product.findById(product._id)).title, product.title);
});

test('цена из числового поля фронтенда преобразуется из строки в число', async () => {
  const image = (await upload()).body;
  const created = await request('/product', {
    method: 'POST', body: { ...productBody(image), price: '1234' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.price, 1234);
  const updated = await request(`/product/${created.body._id}`, {
    method: 'PATCH', body: { price: '0' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.price, 0);
  for (const price of ['', 'abc', {}, [], true]) {
    assert.equal((await request(`/product/${created.body._id}`, {
      method: 'PATCH', body: { price },
    })).status, 400);
  }
});

test('создание и обновление отклоняют путь вне папки изображений', async () => {
  const product = await createProduct();
  for (const fileName of ['/images/../secret.png', '/images/%2e%2e/secret.png',
    '/images/..\\secret.png', '/tmp/secret.png', '/images/%2fsecret.png']) {
    const image = { fileName, originalName: 'secret.png' };
    assert.equal((await request('/product', { method: 'POST', body: productBody(image) })).status, 400);
    assert.equal((await request(`/product/${product._id}`, { method: 'PATCH', body: { image } })).status, 400);
  }
});

test('создание с несуществующей картинкой возвращает 400', async () => {
  const image = { fileName: '/images/missing.png', originalName: 'missing.png' };
  assert.equal((await request('/product', { method: 'POST', body: productBody(image) })).status, 400);
  assert.equal(await Product.countDocuments(), 0);
});

test('PATCH с несуществующей картинкой возвращает 400 и сохраняет прежнюю', async () => {
  const product = await createProduct();
  const image = { fileName: '/images/missing.png', originalName: 'missing.png' };
  const result = await request(`/product/${product._id}`, { method: 'PATCH', body: { image } });
  assert.equal(result.status, 400);
  assert.deepEqual((await Product.findById(product._id)).image.toObject(), product.image);
  assert.equal((await fetch(`${baseUrl}${product.image.fileName}`)).status, 200);
});

test('дубликат title даёт 409 и оставляет загруженный файл для повторной попытки', async () => {
  const first = await createProduct('Первый товар');
  const second = await createProduct('Второй товар');
  for (const [route, method] of [['/product', 'POST'], [`/product/${second._id}`, 'PATCH']]) {
    const image = (await upload()).body;
    const result = await request(route, { method, body: productBody(image, first.title) });
    assert.equal(result.status, 409);
    assert.equal((await fetch(`${baseUrl}${image.fileName}`)).status, 404);
    assert.deepEqual(await fs.readFile(path.join(tempDirectory, path.basename(image.fileName))), png);
  }
  assert.deepEqual((await Product.findById(second._id)).image.toObject(), second.image);
});

test('cron очищает старые временные файлы, сохраняя свежие и постоянные', async () => {
  const first = (await upload()).body;
  const second = (await upload()).body;
  const product = await createProduct();
  const oldPath = path.join(tempDirectory, path.basename(first.fileName));
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await fs.utimes(oldPath, old, old);
  const { cleanupTemporaryFiles } = require('../dist/utils/files');
  await cleanupTemporaryFiles();
  await assert.rejects(fs.access(oldPath), { code: 'ENOENT' });
  await fs.access(path.join(tempDirectory, path.basename(second.fileName)));
  await fs.access(path.join(imageDirectory, path.basename(product.image.fileName)));
});

test('при загрузке пользовательское имя и расширение не определяют имя файла на диске', async () => {
  const result = await upload(png, '../../user-name.php', 'image/png');
  assert.equal(result.status, 200);
  assert.match(result.body.fileName, /^\/images\/[a-f\d-]{36}\.png$/);
  assert.ok(!result.body.fileName.includes('user-name'));
});

test('тип PNG не принимает сигнатуру JPEG', async () => {
  const result = await upload(Buffer.from('ffd8ffe000104a46494600', 'hex'), 'image.png', 'image/png');
  assert.equal(result.status, 400);
  assert.deepEqual(await fs.readdir(tempDirectory), []);
});

test('PATCH с общей старой картинкой не удаляет изображение другого товара', async () => {
  const first = await createProduct('Первый товар');
  const second = await request('/product', {
    method: 'POST', body: productBody(first.image, 'Второй товар'),
  });
  assert.equal(second.status, 201);
  const image = (await upload()).body;
  const result = await request(`/product/${first._id}`, { method: 'PATCH', body: { image } });
  assert.equal(result.status, 200);
  assert.equal((await fetch(`${baseUrl}${first.image.fileName}`)).status, 200);
});

test('DELETE не падает, если файл был удалён ранее', async () => {
  const product = await createProduct();
  await fs.unlink(path.join(imageDirectory, path.basename(product.image.fileName)));
  assert.equal((await request(`/product/${product._id}`, { method: 'DELETE' })).status, 200);
});

test('схема модели проверяет путь картинки и title при обновлении без HTTP', async () => {
  const product = await createProduct();
  const document = await Product.findById(product._id);
  document.title = 'Я';
  await assert.rejects(document.save(), { name: 'ValidationError' });
  document.title = product.title;
  document.image.fileName = '/images/../secret.png';
  await assert.rejects(document.save(), { name: 'ValidationError' });
});

test('временную символическую ссылку нельзя перенести в папку картинок', async () => {
  const uploaded = (await upload()).body;
  const filename = path.join(tempDirectory, path.basename(uploaded.fileName));
  await fs.unlink(filename);
  const secret = path.join(sandbox, 'secret.png');
  await fs.writeFile(secret, png);
  await fs.symlink(secret, filename);
  const result = await request('/product', { method: 'POST', body: productBody(uploaded) });
  assert.equal(result.status, 400);
  await fs.access(secret);
  assert.deepEqual(await fs.readdir(imageDirectory), []);
});

test('параллельные замены картинки не оставляют неиспользуемые постоянные файлы', async () => {
  const product = await createProduct();
  const images = [(await upload()).body, (await upload()).body];
  const results = await Promise.all(images.map((image) => request(`/product/${product._id}`, {
    method: 'PATCH', body: { image },
  })));
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  const saved = await Product.findById(product._id);
  assert.deepEqual(await fs.readdir(imageDirectory), [path.basename(saved.image.fileName)]);
});

test('ошибка одного PATCH не мешает следующему обновлению этого товара', async () => {
  const product = await createProduct();
  const [invalid, valid] = await Promise.all([
    request(`/product/${product._id}`, {
      method: 'PATCH', body: { image: { fileName: '/images/missing.png', originalName: 'missing' } },
    }),
    request(`/product/${product._id}`, { method: 'PATCH', body: { price: 2500 } }),
  ]);
  assert.equal(invalid.status, 400);
  assert.equal(valid.status, 200);
  assert.equal(valid.body.price, 2500);
  assert.equal((await Product.findById(product._id)).price, 2500);
});

test('параллельные замена картинки и удаление товара не оставляют постоянных файлов', async () => {
  const product = await createProduct();
  const image = (await upload()).body;
  const [updated, deleted] = await Promise.all([
    request(`/product/${product._id}`, { method: 'PATCH', body: { image } }),
    request(`/product/${product._id}`, { method: 'DELETE' }),
  ]);
  assert.ok([200, 404].includes(updated.status));
  assert.equal(deleted.status, 200);
  assert.equal(await Product.countDocuments(), 0);
  assert.deepEqual(await fs.readdir(imageDirectory), []);
});
