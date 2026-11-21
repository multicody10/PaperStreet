import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('final CSS enforces pure black navigation, #0E0E0E cards, and #31D49D headings', () => {
  const theme = read('src/paperstreet-black.css');
  const main = read('src/main.tsx');
  assert.match(main,/import '\.\/paperstreet-black\.css'/);
  assert.match(theme,/\.app-shell\.activity-theme \.sidebar,[\s\S]*?background:#000000!important/);
  assert.match(theme,/\.app-shell\.activity-theme :is\(\.panel,[\s\S]*?background-color:#0E0E0E!important/);
  assert.match(theme,/\.app-shell\.activity-theme :is\(\.panel-heading h2,[\s\S]*?color:#31D49D!important/);
});
