import { CheerioCrawler, log } from ‘crawlee’;
import { createObjectCsvWriter } from ‘csv-writer’;
import { writeFileSync } from ‘fs’;

const CONFIG = {
BASE_URL: ‘https://www.99.co/id/jual/tanah/bali’,
MAX_PAGES: 3,
MIN_SURFACE: 1000,
MAX_SURFACE: 30000,
MAX_REQUESTS_PER_CRAWL: 5,
MAX_CONCURRENCY: 1, // Lent mais sûr (évite le ban)
REQUEST_HANDLER_TIMEOUT: 60000 // 60 secondes
};

// Stockage global des résultats
const allResults = [];
const stats = {
pagesProcessed: 0,
totalListings: 0,
filtered: {
noSurface: 0,
surfaceTooSmall: 0,
surfaceTooBig: 0,
noPrice: 0,
noLink: 0
},
valid: 0
};

function extractSurface(item) {
try {
// Méthode 1: Attributs structurés
if (item.attributes?.land_size) {
const val = parseInt(item.attributes.land_size, 10);
if (val > 0) return val;
}

```
if (item.land_size) {
  const val = parseInt(item.land_size, 10);
  if (val > 0) return val;
}

// Méthode 2: Titre
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
const val = parseInt(item.attributes.price, 10);
if (val > 0) return val;
}

```
if (item.price) {
  const val = parseInt(item.price, 10);
  if (val > 0) return val;
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
return `https://www.99.co/id/properti/${item.slug}`;
}

```
if (item.url) {
  const cleanPath = item.url.startsWith('/') ? item.url : '/' + item.url;
  return `https://www.99.co${cleanPath}`;
}

return null;
```

} catch {
return null;
}
}

function extractListingsFromHTML(html) {
try {
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)</script>/);

```
if (!match) {
  log.warning('__NEXT_DATA__ non trouvé dans le HTML');
  return [];
}

const data = JSON.parse(match[1]);

// Chemins possibles pour les listings
const paths = [
  'props.pageProps.data.listings',
  'props.pageProps.initialState.search.result.list',
  'props.pageProps.searchResult.list',
  'props.pageProps.listings'
];

for (const path of paths) {
  const value = path.split('.').reduce((obj, key) => obj?.[key], data);
  
  if (Array.isArray(value) && value.length > 0) {
    log.info(`Listings trouvés via: ${path} (${value.length} items)`);
    
    // Si groupés, flatten
    if (value[0]?.data) {
      return value.flatMap(group => group.data || []);
    }
    
    return value;
  }
}

log.warning('Aucun chemin de listings trouvé');
return [];
```

} catch (error) {
log.error(`Erreur parsing JSON: ${error.message}`);
return [];
}
}

function processListings(listings) {
stats.totalListings += listings.length;

for (const item of listings) {
if (!item) continue;

```
const surface = extractSurface(item);
const price = extractPrice(item);
const lien = buildURL(item);
const titre = item.title || 'Terrain Bali';

// Validation
if (!lien) {
  stats.filtered.noLink++;
  continue;
}

if (surface === 0) {
  stats.filtered.noSurface++;
  continue;
}

if (surface < CONFIG.MIN_SURFACE) {
  stats.filtered.surfaceTooSmall++;
  continue;
}

if (surface > CONFIG.MAX_SURFACE) {
  stats.filtered.surfaceTooBig++;
  continue;
}

if (price === 0) {
  stats.filtered.noPrice++;
  continue;
}

// Ajout
allResults.push({
  titre,
  prix: price,
  lien
});

stats.valid++;
```

}
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
log.info(`CSV créé: ${results.length} annonces`);
}

async function main() {
log.setLevel(log.LEVELS.INFO);

console.log(’\n🚀 SCRAPER 99.CO BALI - CRAWLEE VERSION\n’);
console.log(`URL de base: ${CONFIG.BASE_URL}`);
console.log(`Pages max: ${CONFIG.MAX_PAGES}`);
console.log(`Filtre surface: ${CONFIG.MIN_SURFACE}-${CONFIG.MAX_SURFACE}m²\n`);

const crawler = new CheerioCrawler({
maxRequestsPerCrawl: CONFIG.MAX_REQUESTS_PER_CRAWL,
maxConcurrency: CONFIG.MAX_CONCURRENCY,
requestHandlerTimeoutSecs: CONFIG.REQUEST_HANDLER_TIMEOUT / 1000,

```
// Anti-détection avancée
useSessionPool: true,
persistCookiesPerSession: true,

// Retry configuration
maxRequestRetries: 3,
requestHandlerTimeoutSecs: 60,

async requestHandler({ request, $, body }) {
  const pageNum = request.userData.page || 1;
  log.info(`📄 Traitement page ${pageNum}`);

  // Sauvegarde HTML pour debug (page 1 uniquement)
  if (pageNum === 1) {
    try {
      writeFileSync('debug.html', body, 'utf8');
      log.info('💾 debug.html sauvegardé');
    } catch (e) {
      log.warning(`Impossible de sauver debug.html: ${e.message}`);
    }
  }

  // Extraction des listings
  const listings = extractListingsFromHTML(body);
  
  if (listings.length === 0) {
    log.warning(`Page ${pageNum}: 0 listings trouvés`);
    
    // Vérifier si c'est une page bloquée
    const bodyText = body.toLowerCase();
    if (bodyText.includes('captcha') || bodyText.includes('blocked')) {
      log.error('⚠️ DÉTECTION: Page bloquée ou CAPTCHA');
    } else if (!bodyText.includes('99.co') && !bodyText.includes('properti')) {
      log.error('⚠️ DÉTECTION: Page suspecte (possible redirection)');
    }
    
    return;
  }

  log.info(`Page ${pageNum}: ${listings.length} listings extraits`);
  
  // Traitement
  processListings(listings);
  
  stats.pagesProcessed++;
  
  log.info(`   ✅ ${stats.valid} annonces valides (${stats.totalListings} analysées)`);
},

failedRequestHandler({ request, error }) {
  const pageNum = request.userData.page || '?';
  log.error(`❌ Page ${pageNum} échouée après ${request.retryCount} retries`);
  log.error(`   Erreur: ${error.message}`);
},

async errorHandler({ error, request }) {
  log.error(`⚠️ Erreur handler pour ${request.url}`);
  log.error(`   ${error.message}`);
}
```

});

try {
// Préparer les URLs
const requests = [];

```
for (let page = 1; page <= CONFIG.MAX_PAGES; page++) {
  const url = page === 1 
    ? CONFIG.BASE_URL 
    : `${CONFIG.BASE_URL}?page=${page}`;
  
  requests.push({
    url,
    userData: { page },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      'Referer': 'https://www.99.co/id/'
    }
  });
}

// Lancer le crawl
await crawler.run(requests);

// Rapport final
console.log('\n📊 RAPPORT FINAL');
console.log('═══════════════════════════════════════');
console.log(`Pages traitées: ${stats.pagesProcessed}/${CONFIG.MAX_PAGES}`);
console.log(`Total listings analysés: ${stats.totalListings}`);
console.log('\nFiltrés:');
console.log(`  - Sans lien: ${stats.filtered.noLink}`);
console.log(`  - Sans surface: ${stats.filtered.noSurface}`);
console.log(`  - Surface < ${CONFIG.MIN_SURFACE}m²: ${stats.filtered.surfaceTooSmall}`);
console.log(`  - Surface > ${CONFIG.MAX_SURFACE}m²: ${stats.filtered.surfaceTooBig}`);
console.log(`  - Sans prix: ${stats.filtered.noPrice}`);
console.log(`\n✅ Annonces valides: ${stats.valid}`);
console.log('═══════════════════════════════════════\n');

// Sauvegarder CSV
await saveToCSV(allResults);

if (stats.valid === 0) {
  console.log('⚠️ WARNING: Aucune annonce valide trouvée');
  console.log('Possible causes:');
  console.log('  - Blocage anti-bot');
  console.log('  - Structure HTML changée');
  console.log('  - Filtres trop restrictifs');
  console.log('\nVérifie debug.html pour diagnostiquer\n');
}

console.log('✅ SCRAPING TERMINÉ\n');
process.exit(0);
```

} catch (error) {
console.error(’\n❌ ERREUR FATALE’);
console.error(`Message: ${error.message}`);
console.error(`Stack:\n${error.stack}\n`);

```
// CSV vide en secours
try {
  await saveToCSV([]);
  console.log('📄 CSV vide créé en secours');
} catch (e) {
  console.error(`Impossible de créer CSV: ${e.message}`);
}

process.exit(1);
```

}
}

main();
