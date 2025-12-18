import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

const OUTPUT = 'resultats.csv';
const BASE_URL = 'https://www.99.co/id/jual/tanah/bali';
const MAX_PAGES = 5;

// ================= CSV =================
const csvWriter = createObjectCsvWriter({
  path: OUTPUT,
  header: [
    { id: 'titre', title: 'Titre' },
    { id: 'prix', title: 'Prix_total_IDR' },
    { id: 'surface', title: 'Surface_m2' },
    { id: 'prix_m2', title: 'Prix_m2_IDR' },
    { id: 'lien', title: 'Lien' }
  ],
  append: false
});

const results = [];

// ================= HELPERS (GAS → NODE) =================
function findListings(data) {
  return (
    data?.props?.pageProps?.data?.listings ||
    data?.props?.pageProps?.initialState?.search?.result?.list ||
    data?.props?.pageProps?.searchResult?.list ||
    []
  );
}

function extractSurface(item, text) {
  if (item?.attributes?.land_size) return parseInt(item.attributes.land_size, 10) || 0;
  if (item?.land_size) return parseInt(item.land_size, 10) || 0;

  const m = text.match(/(\d{2,6})\s*(m2|sqm|m²)/);
  return m ? parseInt(m[1], 10) : 0;
}

function extractPrice(item, text) {
  if (item?.attributes?.price) return parseInt(item.attributes.price, 10) || 0;
  if (item?.price) return parseInt(item.price, 10) || 0;

  const m = text.match(/"price":\s*"?(\d{8,15})"?/);
  return m ? parseInt(m[1], 10) : 0;
}

// ================= CRAWLER =================
const crawler = new PlaywrightCrawler({
  headless: true,
  maxConcurrency: 2,
  requestHandlerTimeoutSecs: 60,

  async requestHandler({ page, request, log }) {
    log.info(`📄 ${request.url}`);
    await page.waitForTimeout(3000);

    const html = await page.content();
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) return;

    const data = JSON.parse(match[1]);
    const listings = findListings(data);

    for (const item of listings) {
      const text = JSON.stringify(item).toLowerCase();
      const surface = extractSurface(item, text);
      const price = extractPrice(item, text);

      if (price <= 0) continue;
      if (surface > 0 && (surface < 1000 || surface > 30000)) continue;

      const prix_m2 = surface > 0 ? Math.round(price / surface) : 0;

      let lien = '';
      if (item.slug) {
        lien = `https://www.99.co/id/properti/${item.slug}`;
      } else if (item.url) {
        lien = item.url.startsWith('http')
          ? item.url
          : `https://www.99.co${item.url}`;
      }

      results.push({
        titre: item.title || 'Terrain',
        prix: price,
        surface,
        prix_m2,
        lien
      });
    }

    log.info(`✅ ${results.length} annonces cumulées`);
  }
});

// ================= RUN =================
(async () => {
  try {
    const urls = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      urls.push(`${BASE_URL}?page=${p}`);
    }

    await crawler.run(urls);
    await csvWriter.writeRecords(results);

    console.log(`📁 CSV écrit : ${results.length} lignes`);
    process.exit(0);
  } catch (e) {
    console.error('❌ ERREUR SCRAPER:', e);
    await csvWriter.writeRecords([]);
    process.exit(1);
  }
})();
