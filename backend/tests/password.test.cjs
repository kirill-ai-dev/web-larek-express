const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hashPassword, comparePassword } = require('../dist/utils/password');

test('одинаковые пароли получают разные соли и хеши', async () => {
  const first = await hashPassword('123456789');
  const second = await hashPassword('123456789');
  assert.notEqual(first, second);
  assert.equal(await comparePassword('123456789', first), true);
  assert.equal(await comparePassword('wrong-password', first), false);
});

test('повреждённый хеш не позволяет войти', async () => {
  const valid = await hashPassword('123456789');
  for (const hash of ['', 'plain-password', 'scrypt:bad:bad', `${valid}:extra`]) {
    assert.equal(await comparePassword('123456789', hash), false);
  }
});
