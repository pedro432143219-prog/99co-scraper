import { CheerioCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';
import { writeFileSync } from 'fs';

const BALI_PAGES = 10; // Pages à scraper (max 20 comme dans ton script)

const csvWriter = createObjectCsvWriter({
  path: 'resultats.csv',
  header: [
    { id: 'titre', title: 'Titre' },
    { id: 'prix', title: 'Prix' },
    { id: 'lien', title: 'Lien' }
  ]
});

const results = [];

const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: BALI_PAGES,
  
  requestHandler: async ({ request, $, log }) => {
    const pageNum = new URL(request.url).searchParams.get('page') || '1';
    log.info(`📄 Scraping page ${pageNum}...`);

    // Extraction du JSON Next.js
    const scriptContent = $('#__NEXT_DATA__').html();
    
    if (!scriptContent) {
      log.warning(`⚠️ Pas de données JSON sur page ${pageNum}`);
      return;
    }

    try {
      const data = JSON.parse(scriptContent);
      const listings = data?.props?.pageProps?.data?.listings || 
                      data?.props?.pageProps?.initialState?.search?.result?.list || 
                      data?.props?.pageProps?.searchResult?.list || [];

      log.info(`✅ ${listings.length} annonces trouvées sur page ${pageNum}`);

      listings.forEach(item => {
        if (!item) return;

        // Construction de l'URL
        let link = 'URL_MANQUANTE';
        const slug = item.slug || '';
        const rawUrl = item.url || '';
        
        if (slug) {
          link = `https://www.99.co/id/properti/${slug}`;
        } else if (rawUrl) {
          let cleanPath = rawUrl.toString().startsWith('/') ? rawUrl : '/' + rawUrl;
          if (!cleanPath.startsWith('/id/')) {
            cleanPath = cleanPath.includes('properti') ? `/id${cleanPath}` : `/id/properti${cleanPath}`;
          }
          link = `https://www.99.co${cleanPath}`;
        }

        // Extraction prix
        const price = item.attributes?.price || item.price || 0;
        const priceFormatted = price > 0 ? `${(price / 1000000).toFixed(1)} Jt IDR` : 'Prix N/C';

        // Extraction surface
        const text = JSON.stringify(item).toLowerCase();
        let surface = 0;
        
        if (item.attributes?.land_size) {
          surface = parseInt(item.attributes.land_size, 10);
        } else if (item.land_size) {
          surface = parseInt(item.land_size, 10);
        } else {
          const match = text.match(/(\d{2,6})\s*(m2|sqm|m²)/);
          if (match) surface = parseInt(match[1], 10);
        }

        // Filtrage (1000-30000 m²)
        if (surface < 1000 || surface > 30000) return;

        const titre = item.title || 'Terrain à Bali';

        results.push({
          titre: `${titre} - ${surface}m²`,
          prix: priceFormatted,
          lien: link
        });
      });

    } catch (e) {
      log.error(`❌ Erreur parsing JSON page ${pageNum}: ${e.message}`);
    }
  },

  failedRequestHandler: async ({ request, log }) => {
    log.error(`❌ Échec requête: ${request.url}`);
  }
});

// Génération des URLs
const urls = Array.from({ length: BALI_PAGES }, (_, i) => 
  `https://www.99.co/id/jual/tanah/bali?page=${i + 1}`
);

console.log(`🚀 Démarrage scraping ${BALI_PAGES} pages Bali...\n`);

await crawler.run(urls);

// Sauvegarde CSV
if (results.length > 0) {
  await csvWriter.writeRecords(results);
  console.log(`\n✅ ${results.length} annonces sauvegardées dans resultats.csv`);
  
  // Aperçu des résultats
  console.log('\n📊 Aperçu des 5 premières annonces:');
  results.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.titre}`);
    console.log(`   💰 ${r.prix}`);
    console.log(`   🔗 ${r.lien}\n`);
  });
} else {
  console.log('❌ Aucune annonce trouvée');
  writeFileSync('resultats.csv', 'Titre,Prix,Lien\n');
}

console.log('✨ Scraping terminé !');
