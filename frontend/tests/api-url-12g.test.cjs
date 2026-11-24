const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const apiSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'api.ts'), 'utf8');
const viteSource = fs.readFileSync(
  path.join(__dirname, '..', 'vite.config.ts'), 'utf8');

test('desarrollo conserva el fallback API local', () => {
  assert.match(apiSource, /localhost:8000\/api/);
});

test('produccion sin VITE_API_URL usa el proxy relativo /api', () => {
  assert.match(apiSource, /MODE==='production'\s*\?\s*'\/api'/);
});

test('un build productivo puede rechazar una API local', () => {
  assert.match(viteSource, /VITE_DEPLOY_ENV/);
  assert.match(viteSource, /de produccion debe ser \/api/);
});
