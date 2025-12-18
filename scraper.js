import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

const OUTPUT = 'resultats.csv';

// === CONFIG BALI ===
const BASE_URL = 'https://www.99.co/id/jual/tanah/bali';
const MAX_PAGES = 5; // augmente progressivement (ex: 20)

// === CSV ===
const csvWriter = createObjectCsvWriter({
  path: OUTPUT,
  header: [
    { id: 'titre', title: 'Titre' },
    { id: 'prix', title: 'Prix' },
    { id: 'lien', title: 'Lien' }
  ],
  append: false
});

const results = [];

// === CRAWLER ===
const crawler = new PlaywrightCrawler({
  headless: true,
  maxConcurrency: 2,
  requestHandlerTimeoutSecs: 60,

  async requestHandler({ page, request, log }) {
    log.info(`📄 ${request.url}`);

    // On attend juste que le JS soit chargé
    await page.waitForTimeout(3000);

    const html = await page.content();

    // Extraction __NEXT_DATA__
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );

    if (!match) {
      log.warning('❌ __NEXT_DATA__ introuvable');
      return;
    }

    const data = JSON.parse(match[1]);

    // Chemins possibles (99.co change parfois)
    const listings =
      data?.props?.pageProps?.data?.listings ||
      data?.props?.pageProps?.initialState?.search?.result?.list ||
      data?.props?.pageProps?.searchResult?.list ||
      [];

    if (!Array.isArray(listings) || listings.length === 0) {
      log.warning('⚠️ 0 annonce trouvée');
      return;
    }

    for (const item of listings) {
      if (!item) continue;

      const titre = item.title || item.name || 'Terrain';
      const prix =
        item.attributes?.price ||
        item.price ||
        0;

      let lien = '';
      if (item.slug) {
        lien = `https://www.99.co/id/properti/${item.slug}`;
      } else if (item.url) {
        lien = item.url.startsWith('http')
          ? item.url
          : `https://www.99.co${item.url}`;
      }

      if (!lien) continue;

      results.push({
        titre: titre.toString().trim(),
        prix: prix ? prix.toString() : '0',
        lien
      });
    }

    log.info(`✅ ${listings.length} annonces extraites`);
  }
});

// === RUN ===
(async () => {
  try {
    const urls = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      urls.push(`${BASE_URL}?page=${p}`);
    }

    await crawler.run(urls);

    // Toujours écrire le CSV (même vide)
    await csvWriter.writeRecords(results);

    console.log(`📁 CSV écrit : ${results.length} lignes`);
    process.exit(0);

  } catch (err) {
    console.error('❌ ERREUR SCRAPER:', err);

    // CSV vide mais valide
    await csvWriter.writeRecords([]);
    process.exit(1);
  }
})();
