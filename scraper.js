import puppeteer from 'puppeteer';
import { createObjectCsvWriter } from 'csv-writer';

const CSV_FILE = 'resultats.csv';
const BASE_URL = 'https://www.99.co/id/jual/tanah/bali';
const MAX_PAGES = 5; // Commencez petit pour tester

(async () => {
  console.log('🚀 Démarrage du scraper Bali...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const results = [];
  
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    try {
      const url = `${BASE_URL}?page=${pageNum}`;
      console.log(`📄 Page ${pageNum}/${MAX_PAGES} : ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Attendre que les annonces se chargent
      await page.waitForSelector('article, [data-testid*="listing"]', { timeout: 10000 });
      
      const listings = await page.evaluate(() => {
        const items = [];
        const articles = document.querySelectorAll('article, [data-testid*="listing-card"]');
        
        articles.forEach(article => {
          const titleEl = article.querySelector('h2, [data-testid*="title"]');
          const priceEl = article.querySelector('[data-testid*="price"], .price');
          const linkEl = article.querySelector('a[href*="/properti/"]');
          
          if (titleEl && priceEl && linkEl) {
            items.push({
              titre: titleEl.innerText.trim(),
              prix: priceEl.innerText.trim(),
              lien: linkEl.href
            });
          }
        });
        
        return items;
      });
      
      console.log(`   ✅ ${listings.length} annonces trouvées`);
      results.push(...listings);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`   ❌ Erreur page ${pageNum}: ${error.message}`);
    }
  }
  
  await browser.close();
  
  console.log(`\n📊 Total : ${results.length} annonces`);
  
  if (results.length === 0) {
    console.error('❌ AUCUNE ANNONCE TROUVÉE - Vérifiez les sélecteurs CSS');
    process.exit(1);
  }
  
  // Écriture CSV
  const csvWriter = createObjectCsvWriter({
    path: CSV_FILE,
    header: [
      { id: 'titre', title: 'Titre' },
      { id: 'prix', title: 'Prix' },
      { id: 'lien', title: 'Lien' }
    ]
  });
  
  await csvWriter.writeRecords(results);
  console.log(`✅ Fichier ${CSV_FILE} créé avec succès`);
})();
