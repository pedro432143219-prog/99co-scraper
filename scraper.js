import { PlaywrightCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';

const CSV_FILE = 'resultats.csv';
const MAX_PAGES = 5;
const results = [];

console.log('🏝️ === SCRAPER BALI AVEC CRAWLEE ===\n');

const crawler = new PlaywrightCrawler({
  // Headless browser (gratuit, pas d'API externe)
  launchContext: {
    launchOptions: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  },
  
  // Limite de requêtes simultanées
  maxConcurrency: 1,
  
  // Handler pour chaque page
  async requestHandler({ request, page, log }) {
    const pageNum = request.userData.pageNum;
    log.info(`📄 Scraping page ${pageNum}...`);
    
    try {
      // Attendre que les annonces se chargent
      await page.waitForSelector('article, [data-testid*="listing"]', { 
        timeout: 15000 
      });
      
      // Petit délai pour s'assurer que tout est chargé
      await page.waitForTimeout(2000);
      
      // Extraction des données
      const listings = await page.evaluate(() => {
        const items = [];
        
        // Sélecteurs multiples pour plus de robustesse
        const selectors = [
          'article',
          '[data-testid*="listing-card"]',
          '[data-testid*="property-card"]',
          '.listing-card'
        ];
        
        let articles = [];
        for (const selector of selectors) {
          articles = document.querySelectorAll(selector);
          if (articles.length > 0) break;
        }
        
        articles.forEach(article => {
          // Extraction titre
          const titleSelectors = [
            'h2',
            'h3',
            '[data-testid*="title"]',
            '.listing-title',
            'a[href*="/properti/"]'
          ];
          
          let titre = '';
          for (const sel of titleSelectors) {
            const el = article.querySelector(sel);
            if (el?.innerText) {
              titre = el.innerText.trim();
              break;
            }
          }
          
          // Extraction prix
          const priceSelectors = [
            '[data-testid*="price"]',
            '.price',
            '[class*="price"]',
            '[class*="Price"]'
          ];
          
          let prix = 'Prix non affiché';
          for (const sel of priceSelectors) {
            const el = article.querySelector(sel);
            if (el?.innerText) {
              prix = el.innerText.trim();
              break;
            }
          }
          
          // Si pas trouvé, chercher "Rp" dans le texte
          if (prix === 'Prix non affiché') {
            const text = article.innerText;
            const match = text.match(/Rp[\s\d.,]+(?:juta|jt|miliar|milyar|M|B)?/i);
            if (match) prix = match[0];
          }
          
          // Extraction lien
          const linkEl = article.querySelector('a[href*="/properti/"]');
          let lien = '';
          
          if (linkEl) {
            lien = linkEl.href;
          } else {
            // Chercher dans tous les liens
            const allLinks = article.querySelectorAll('a[href]');
            for (const link of allLinks) {
              if (link.href.includes('/properti/')) {
                lien = link.href;
                break;
              }
            }
          }
          
          // Ajouter seulement si on a au minimum un titre et un lien
          if (titre && lien) {
            items.push({ titre, prix, lien });
          }
        });
        
        return items;
      });
      
      if (listings.length > 0) {
        results.push(...listings);
        log.info(`   ✅ ${listings.length} annonces trouvées`);
      } else {
        log.warning(`   ⚠️ Aucune annonce trouvée sur cette page`);
      }
      
    } catch (error) {
      log.error(`   ❌ Erreur extraction: ${error.message}`);
    }
  },
  
  // Gestion des erreurs
  failedRequestHandler({ request, log }) {
    log.error(`❌ Échec: ${request.url}`);
  }
});

// Ajouter les URLs à scraper
const urls = [];
for (let page = 1; page <= MAX_PAGES; page++) {
  urls.push({
    url: `https://www.99.co/id/jual/tanah/bali?page=${page}`,
    userData: { pageNum: page }
  });
}

// Lancer le crawling
await crawler.run(urls);

// Résultats
console.log(`\n📊 TOTAL: ${results.length} annonces collectées`);

if (results.length === 0) {
  console.error('❌ Aucune annonce trouvée - les sélecteurs doivent être mis à jour');
  process.exit(1);
}

// Supprimer les doublons
const uniqueResults = Array.from(
  new Map(results.map(item => [item.lien, item])).values()
);

console.log(`🔄 Après dédoublonnage: ${uniqueResults.length} annonces uniques`);

// Écriture CSV
const csvWriter = createObjectCsvWriter({
  path: CSV_FILE,
  header: [
    { id: 'titre', title: 'Titre' },
    { id: 'prix', title: 'Prix' },
    { id: 'lien', title: 'Lien' }
  ]
});

await csvWriter.writeRecords(uniqueResults);

console.log(`✅ ${CSV_FILE} créé avec succès!`);
console.log(`📁 ${uniqueResults.length} lignes écrites\n`);

// Afficher quelques exemples
console.log('📋 Exemples d\'annonces:');
uniqueResults.slice(0, 3).forEach((item, i) => {
  console.log(`\n${i + 1}. ${item.titre}`);
  console.log(`   💰 ${item.prix}`);
  console.log(`   🔗 ${item.lien}`);
});
