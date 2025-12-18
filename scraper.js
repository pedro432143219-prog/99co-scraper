import { createObjectCsvWriter } from ‘csv-writer’;
import { writeFileSync } from ‘fs’;

const CONFIG = {
// API interne de 99.co (découverte via DevTools)
API_URL: ‘https://www.99.co/api/v1/web/search/listings’,
REGION: ‘bali’,
MAX_RESULTS: 100,
MIN_SURFACE: 1000,
MAX_SURFACE: 30000,
RETRY_ATTEMPTS: 3,
RETRY_DELAY: 3000
};

function sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, attempt = 1) {
try {
console.log(`📡 Tentative ${attempt}/${CONFIG.RETRY_ATTEMPTS}: ${url}`);

```
const response = await fetch(url, {
  ...options,
  signal: AbortSignal.timeout(15000) // 15s timeout
});

console.log(`   Status: ${response.status} ${response.statusText}`);

if (!response.ok) {
  if (attempt < CONFIG.RETRY_ATTEMPTS) {
    console.log(`   ⏳ Retry dans ${CONFIG.RETRY_DELAY}ms...`);
    await sleep(CONFIG.RETRY_DELAY);
    return fetchWithRetry(url, options, attempt + 1);
  }
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const contentType = response.headers.get('content-type');
console.log(`   Content-Type: ${contentType}`);

// Essayer JSON d'abord
if (contentType?.includes('application/json')) {
  const data = await response.json();
  console.log(`   ✅ JSON reçu: ${JSON.stringify(data).length} chars`);
  return { type: 'json', data };
}

// Sinon HTML
const html = await response.text();
console.log(`   ✅ HTML reçu: ${(html.length / 1024).toFixed(2)} KB`);

writeFileSync('debug.html', html, 'utf8');
console.log('   💾 debug.html sauvegardé');

return { type: 'html', data: html };
```

} catch (error) {
console.error(`   ❌ Erreur: ${error.message}`);

```
if (attempt < CONFIG.RETRY_ATTEMPTS && error.name !== 'AbortError') {
  console.log(`   ⏳ Retry dans ${CONFIG.RETRY_DELAY}ms...`);
  await sleep(CONFIG.RETRY_DELAY);
  return fetchWithRetry(url, options, attempt + 1);
}

throw error;
```

}
}

async function tryAPIApproach() {
console.log(’\n🔬 APPROCHE 1: API directe’);

try {
const params = new URLSearchParams({
listing_type: ‘sale’,
property_type: ‘land’,
search_region: CONFIG.REGION,
page_size: CONFIG.MAX_RESULTS,
page: 1
});

```
const url = `${CONFIG.API_URL}?${params}`;

const result = await fetchWithRetry(url, {
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.99.co/id/jual/tanah/bali'
  }
});

if (result.type === 'json' && result.data?.listings) {
  return result.data.listings;
}

console.log('   ⚠️ Pas de listings dans la réponse JSON');
return null;
```

} catch (error) {
console.error(`   ❌ API approach failed: ${error.message}`);
return null;
}
}

async function tryHTMLScraping() {
console.log(’\n🔬 APPROCHE 2: Scraping HTML classique’);

try {
const url = ‘https://www.99.co/id/jual/tanah/bali’;

```
const result = await fetchWithRetry(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

if (result.type !== 'html') {
  console.log('   ⚠️ Response is not HTML');
  return null;
}

const html = result.data;

// Extraction du JSON embarqué
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

if (!match) {
  console.log('   ⚠️ __NEXT_DATA__ non trouvé');
  
  // Test si la page contient du texte cohérent
  if (html.includes('99.co') || html.includes('properti')) {
    console.log('   ℹ️ Page 99.co détectée mais structure différente');
  } else {
    console.log('   ⚠️ Page suspecte (possible blocage)');
  }
  
  return null;
}

console.log('   ✅ __NEXT_DATA__ trouvé');

const jsonData = JSON.parse(match[1]);

// Multiples chemins possibles
const paths = [
  'props.pageProps.data.listings',
  'props.pageProps.initialState.search.result.list',
  'props.pageProps.searchResult.list',
  'props.pageProps.listings'
];

for (const path of paths) {
  const value = path.split('.').reduce((obj, key) => obj?.[key], jsonData);
  if (Array.isArray(value) && value.length > 0) {
    console.log(`   ✅ Listings trouvés via: ${path} (${value.length} items)`);
    
    // Si ce sont des groupes, flatten
    if (value[0]?.data) {
      return value.flatMap(group => group.data || []);
    }
    
    return value;
  }
}

console.log('   ⚠️ Aucun chemin de listings valide');
return null;
```

} catch (error) {
console.error(`   ❌ HTML scraping failed: ${error.message}`);
return null;
}
}

function extractData(item) {
// Surface
let surface = 0;
if (item.attributes?.land_size) {
surface = parseInt(item.attributes.land_size, 10) || 0;
} else if (item.land_size) {
surface = parseInt(item.land_size, 10) || 0;
} else {
const text = (item.title || ‘’).toLowerCase();
const match = text.match(/(\d{3,6})\s*(?:m2|m²|sqm)/i);
if (match) surface = parseInt(match[1], 10);
}

// Prix
let price = 0;
if (item.attributes?.price) {
price = parseInt(item.attributes.price, 10) || 0;
} else if (item.price) {
price = parseInt(item.price, 10) || 0;
}

// URL
let lien = ‘URL_MANQUANTE’;
if (item.slug) {
lien = `https://www.99.co/id/properti/${item.slug}`;
} else if (item.url) {
const cleanPath = item.url.startsWith(’/’) ? item.url : ‘/’ + item.url;
lien = `https://www.99.co${cleanPath}`;
}

return {
titre: item.title || ‘Terrain Bali’,
surface,
prix: price,
lien,
prixM2: (surface > 0 && price > 0) ? Math.round(price / surface) : 0
};
}

function filterAndSort(listings) {
console.log(`\n📊 Filtrage de ${listings.length} annonces...`);

const results = [];
let stats = {
total: listings.length,
noSurface: 0,
surfaceTooSmall: 0,
surfaceTooBig: 0,
noPrice: 0,
valid: 0
};

for (const item of listings) {
const data = extractData(item);

```
// Validation
if (data.surface === 0) {
  stats.noSurface++;
  continue;
}

if (data.surface < CONFIG.MIN_SURFACE) {
  stats.surfaceTooSmall++;
  continue;
}

if (data.surface > CONFIG.MAX_SURFACE) {
  stats.surfaceTooBig++;
  continue;
}

if (data.prix === 0) {
  stats.noPrice++;
  continue;
}

stats.valid++;
results.push({
  titre: data.titre,
  prix: data.prix,
  lien: data.lien
});
```

}

console.log(`   Total: ${stats.total}`);
console.log(`   Sans surface: ${stats.noSurface}`);
console.log(`   Surface < ${CONFIG.MIN_SURFACE}m²: ${stats.surfaceTooSmall}`);
console.log(`   Surface > ${CONFIG.MAX_SURFACE}m²: ${stats.surfaceTooBig}`);
console.log(`   Sans prix: ${stats.noPrice}`);
console.log(`   ✅ Valides: ${stats.valid}`);

return results;
}

async function saveToCSV(results) {
const csvWriter = createObjectCsvWriter({
path: ‘resultats.csv’,
header: [
{ id: ‘titre’, title: ‘Titre’ },
{ id: ‘prix’, title: ‘Prix (IDR)’ },
{ id: ‘lien’, title: ‘Lien’ }
]
});

await csvWriter.writeRecords(results);
console.log(`\n✅ CSV créé: ${results.length} annonces`);
}

async function main() {
console.log(‘🚀 SCRAPER 99.CO BALI - VERSION ROBUSTE\n’);
console.log(`Région: ${CONFIG.REGION}`);
console.log(`Filtre surface: ${CONFIG.MIN_SURFACE}-${CONFIG.MAX_SURFACE}m²`);
console.log(`Max retry: ${CONFIG.RETRY_ATTEMPTS}x`);

try {
let listings = null;

```
// Essayer l'API d'abord
listings = await tryAPIApproach();

// Sinon HTML scraping
if (!listings || listings.length === 0) {
  listings = await tryHTMLScraping();
}

// Si toujours rien
if (!listings || listings.length === 0) {
  console.log('\n❌ AUCUNE APPROCHE N\'A FONCTIONNÉ');
  console.log('Possible causes:');
  console.log('  - Blocage anti-bot de 99.co');
  console.log('  - Structure du site changée');
  console.log('  - Timeout réseau');
  
  console.log('\n📄 Création d\'un CSV vide...');
  await saveToCSV([]);
  
  process.exit(1);
}

// Filtrage et tri
const results = filterAndSort(listings);

// Sauvegarde
await saveToCSV(results);

console.log('\n✅ SCRAPING RÉUSSI');
process.exit(0);
```

} catch (error) {
console.error(’\n❌ ERREUR FATALE’);
console.error(`Message: ${error.message}`);
console.error(`Stack:\n${error.stack}`);

```
// CSV vide en secours
try {
  await saveToCSV([]);
  console.log('📄 CSV vide créé en secours');
} catch (e) {
  console.error(`Impossible de créer le CSV: ${e.message}`);
}

process.exit(1);
```

}
}

main();
