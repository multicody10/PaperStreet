import { readFileSync, writeFileSync } from 'node:fs';

const id = process.env.PAPERSTREET_D1_DATABASE_ID?.trim() ?? '';
if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) {
  throw new Error('Set the PAPERSTREET_D1_DATABASE_ID GitHub Actions repository variable to your Cloudflare D1 database UUID.');
}

const filename = new URL('../wrangler.jsonc', import.meta.url);
const config = JSON.parse(readFileSync(filename, 'utf8'));
const database = config.d1_databases?.find(entry => entry.binding === 'DB');
if (!database || database.database_name !== 'paperstreet') {
  throw new Error('Expected the PaperStreet D1 database binding named DB in wrangler.jsonc.');
}

database.database_id = id;
writeFileSync(filename, JSON.stringify(config, null, 2) + "\n");
console.log('Prepared D1 binding for deployment. This change is local to the Actions runner.');
