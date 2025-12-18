import { createObjectCsvWriter } from ‘csv-writer’;
import { writeFileSync } from ‘fs’;

const CONFIG = {
BASE_URL: ‘https://www.99.co’,
SEARCH_URL: ‘https://www.99.co/id/jual/tanah/bali’,
MAX_PAGES: 5,
DELAY: 2000,
MIN_SURFACE: 1000,
MAX_SURFACE: 30000
};

async function sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
try {
console.log(`📡 Fetching: ${url}`);
const response = await fetch(url, {
headers: {
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36’
}
});

```
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const html = await response.text();

// Sauvegarde pour debug (seulement première page)
if (url.includes('page=1') || !url.includes('page=')) {
  writeFileSync('debug.html', html, 'utf8');
  console.log('💾 debug.html sauvegardé');
}

return html;
```

} catch (error) {
console.error(`❌ Erreur fetch: ${error.message}`);
return null;
}
}

function extractListingsFromHTML(html) {
try {
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)</script>/);

```
if (!match) {
  console.log('⚠️ Aucun __NEXT_DATA__ trouvé');
  return [];
}

const data = JSON.parse(match[1]);

// Plusieurs chemins possibles selon la structure
let listings = data?.props?.pageProps?.data?.listings || 
               data?.props?.pageProps?.initialState?.search?.result?.list ||
               data?.props?.pageProps?.searchResult?.list ||
               [];

// Si les listings sont dans des groupes
if (listings.length > 0 && listings[0]?.data) {
  listings = listings.flatMap(group => group.data || []);
}

return listings;
```

} catch (error) {
console.error(`❌ Erreur parsing JSON: ${error.message}`);
return [];
}
}

function extractSurface(item) {
try {
// Priorité aux attributs structurés
if (item.attributes?.land_size) {
const val = parseInt(item.attributes.land_size, 10);
if (val > 0) return val;
}

```
if (item.land_size) {
  const val = parseInt(item.land_size, 10);
  if (val > 0) return val;
}

// Sinon extraction du titre
const text = (item.title || '').toLowerCase();
const match = text.match(/(\d{3,6})\s*(?:m2|m²|sqm)/i);

if (match) {
  return parseInt(match[1], 10);
}

return 0;
```

} catch {
return 0;
}
}

function extractPrice(item) {
try {
if (item.attributes?.price) {
return parseInt(item.attributes.price, 10) || 0;
}

```
if (item.price) {
  return parseInt(item.price, 10) || 0;
}

// Extraction depuis le texte
const text = JSON.stringify(item).toLowerCase();
const match = text.match(/"price":\s*"?(\d{8,15})"?/);

if (match) {
  return parseInt(match[1], 10);
}

return 0;
```

} catch {
return 0;
}
}

function buildURL(item) {
try {
if (item.slug) {
return `${CONFIG.BASE_URL}/id/properti/${item.slug}`;
}

```
if (item.url) {
  const cleanPath = item.url.startsWith('/') ? item.url : '/' + item.url;
  return `${CONFIG.BASE_URL}${cleanPath}`;
}

return 'URL_MANQUANTE';
```

} catch {
return ‘URL_MANQUANTE’;
}
}

async function scrapeAllPages() {
const allResults = [];
let totalProcessed = 0;
let totalFiltered = 0;

for (let page = 1; page <= CONFIG.MAX_PAGES; page++) {
const url = page === 1
? CONFIG.SEARCH_URL
: `${CONFIG.SEARCH_URL}?page=${page}`;

```
const html = await fetchPage(url);

if (!html) {
  console.log(`⏭️ Page ${page} ignorée (fetch échoué)`);
  break;
}

const listings = extractListingsFromHTML(html);

if (listings.length === 0) {
  console.log(`⏭️ Page ${page} : 0 annonces, arrêt`);
  break;
}

console.log(`📄 Page ${page} : ${listings.length} annonces trouvées`);
totalProcessed += listings.length;

let addedFromPage = 0;

for (const item of listings) {
  if (!item) continue;

  const surface = extractSurface(item);
  const price = extractPrice(item);
  const titre = item.title || 'Terrain Bali';
  const lien = buildURL(item);

  // Filtrage
  if (surface < CONFIG.MIN_SURFACE || surface > CONFIG.MAX_SURFACE) {
    totalFiltered++;
    continue;
  }

  if (price <= 0) {
    totalFiltered++;
    continue;
  }

  const priceM2 = Math.round(price / surface);

  allResults.push({
    titre,
    prix: price,
    lien,
    surface,
    prixM2: priceM2
  });

  addedFromPage++;
}

console.log(`   ✅ ${addedFromPage} ajoutés, ${listings.length - addedFromPage} filtrés`);

// Délai entre pages
if (page < CONFIG.MAX_PAGES) {
  await sleep(CONFIG.DELAY);
}
```

}

console.log(`\n📊 RÉSUMÉ`);
console.log(`   Total analysé: ${totalProcessed}`);
console.log(`   Total filtré: ${totalFiltered}`);
console.log(`   Total retenu: ${allResults.length}`);

return allResults;
}

async function saveToCSV(results) {
if (results.length === 0) {
console.log(‘⚠️ Aucun résultat à sauvegarder’);

```
// Créer un CSV vide avec header pour éviter l'erreur
const csvWriter = createObjectCsvWriter({
  path: 'resultats.csv',
  header: [
    { id: 'titre', title: 'Titre' },
    { id: 'prix', title: 'Prix (IDR)' },
    { id: 'lien', title: 'Lien' }
  ]
});

await csvWriter.writeRecords([]);
console.log('📄 CSV vide créé');
return;
```

}

const csvWriter = createObjectCsvWriter({
path: ‘resultats.csv’,
header: [
{ id: ‘titre’, title: ‘Titre’ },
{ id: ‘prix’, title: ‘Prix (IDR)’ },
{ id: ‘lien’, title: ‘Lien’ }
]
});

await csvWriter.writeRecords(results);
console.log(`✅ CSV créé : ${results.length} lignes`);
}

async function main() {
try {
console.log(‘🚀 Démarrage du scraper 99.co Bali\n’);

```
const results = await scrapeAllPages();
await saveToCSV(results);

console.log('\n✅ Scraping terminé avec succès');
process.exit(0);
```

} catch (error) {
console.error(`\n❌ ERREUR FATALE: ${error.message}`);
console.error(error.stack);
process.exit(1);
}
}

main();
