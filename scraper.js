import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';
import crypto from 'crypto';

// ================= CONFIG =================
const START_URLS = [
  'https://www.99.co/id/jual/tanah/bali'
];

const OUTPUT_CSV = 'resultats.csv';

// ================= UTILITAIRES =================
function hash(str) {
  return crypto.createHash('sha256').update(str).digest('base64');
}

function extractSurface(item, text) {
  try {
    if (item?.attributes?.land_size) {
      const v = parseInt(item.attributes.land_size, 10);
      if (v > 0) return v;
    }
    if (item?.land_size) {
      const v = parseInt(item.land_size, 10);
      if (v > 0) return v;
    }
    const m = text.match(/(\d{2,6})\s*(m2|m²|sqm)/i);
    if (m) return parseInt(m[1], 10);
  } catch {}
  return 0;
}

function extractPrice(item, text) {
  try {
    if (item?.attributes?.price) {
      const v = parseInt(item.attributes.price, 10);
      if (v > 1_000_000) return v;
    }
    if (item?.price) {
      const v = parseInt(item.price, 10);
      if (v > 1_000_000) return v;
    }
    const m = text.match(/"price":\s*"?(\d{8,15})"?/);
    if (m) return parseInt(m[1], 10);

    const t = text.match(/([\d\.]+)\s*(jt|juta|miliar|billion)/);
    if (t) {
      let v = parseFloat(t[1].replace(/\./g, ''));
      if (t[2].includes('jt') || t[2].includes('juta')) v *= 1_000_000;
      if (t[2].includes('miliar') || t[2].includes('billion')) v *= 1_000_000_000;
      if (v > 1_000_000) return Math.round(v);
    }
  } catch {}
  return 0;
}

// ================= CSV INIT =================
const rows = [];
rows.push([
  'Titre',
  'Prix_total_IDR',
  'Lien',
  'Surface_m2',
  'Prix_m2_IDR',
  'Beach',
  'WhiteSand',
  'Hash'
]);

const seen = new Set();

// ================= CRAWLER =================
const crawler = new PlaywrightCrawler({
  maxConcurrency: 1,
  headless: true,

  async requestHandler({ page, request }) {
    console.log(`🌐 Page: ${request.url}`);

    const results = [];

    // 🔑 INTERCEPTION API 99.CO
    await page.route('**/*', async route => {
      const url = route.request().url();

      if (url.includes('/search') && url.includes('jual')) {
        try {
          const response = await route.fetch();
          const json = await response.json();

          const listings =
            json?.data?.listings ||
            json?.data?.result ||
            json?.listings ||
            [];

          if (Array.isArray(listings) && listings.length > 0) {
            console.log(`📡 API capturée: ${listings.length} annonces`);
            listings.forEach(l => results.push(l));
          }

          return route.fulfill({ response });
        } catch {
          return route.continue();
        }
      }

      return route.continue();
    });

    // Navigation
    await page.goto(request.url, { waitUntil: 'networkidle' });

    // Laisser le temps aux XHR
    await page.waitForTimeout(4000);

    console.log(`📦 Total annonces collectées: ${results.length}`);

    // ================= TRAITEMENT =================
    for (const item of results) {
      const text = JSON.stringify(item).toLowerCase();

      const surface = extractSurface(item, text);
      const price = extractPrice(item, text);

      if (price <= 0) continue;
      if (surface < 1000 || surface > 30000) continue;

      const priceM2 = Math.round(price / surface);

      let link = 'URL_MANQUANTE';
      if (item.slug) {
        link = `https://www.99.co/id/properti/${item.slug}`;
      } else if (item.url) {
        link = item.url.startsWith('http')
          ? item.url
          : `https://www.99.co${item.url}`;
      }

      const h = hash(link);
      if (seen.has(h)) continue;
      seen.add(h);

      rows.push([
        item.title || 'Terrain',
        price,
        link,
        surface,
        priceM2,
        /pantai|beach|seaside|tepi laut/.test(text) ? 'YES' : 'NO',
        /pasir putih|white sand|pantai putih/.test(text) ? 'YES' : 'NO',
        h
      ]);
    }
  }
});

// ================= RUN =================
await crawler.run(START_URLS);

// ================= WRITE CSV =================
const csv = rows.map(r =>
  r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
).join('\n');

fs.writeFileSync(OUTPUT_CSV, csv, 'utf8');

console.log(`✅ CSV généré: ${rows.length - 1} annonces`);
