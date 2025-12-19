import { PlaywrightCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';

const PAGES_TO_SCRAPE = 5; 

const csvWriter = createObjectCsvWriter({
    path: 'resultats.csv',
    header: [
        { id: 'title', title: 'Titre' },
        { id: 'price', title: 'Prix_Total' },
        { id: 'surface', title: 'Surface_m2' },
        { id: 'pricem2', title: 'Prix_m2' },
        { id: 'location', title: 'Lieu' },
        { id: 'link', title: 'Lien' }
    ]
});

const startUrls = [];
for (let i = 1; i <= PAGES_TO_SCRAPE; i++) {
    startUrls.push(`https://www.99.co/id/jual/tanah/bali?page=${i}`);
}

const crawler = new PlaywrightCrawler({
    launchContext: { launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } },
    maxConcurrency: 2,
    preNavigationHooks: [
        async ({ page }) => {
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            });
        }
    ],
    async requestHandler({ page, log, request }) {
        log.info(`🔍 Analyse : ${request.url}`);
        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        
        // Scroll pour charger les données
        await page.evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 2000));
        });

        const listings = await page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('div[class*="card"], div[class*="listing"]');

            cards.forEach(card => {
                try {
                    const text = card.innerText;
                    const priceMatch = text.match(/Rp\s*([\d,.]+)\s*(Miliar|Juta|Jt|M|Billion)/i);
                    const surfaceMatch = text.match(/(\d+[\d,.]*)\s*(m²|m2|sqm)/i);
                    const linkEl = card.querySelector('a');
                    let link = linkEl ? linkEl.href : null;

                    if (priceMatch && link) {
                        // Calcul numérique du prix
                        let p = parseFloat(priceMatch[1].replace(/,/g, ''));
                        if (priceMatch[2].toLowerCase().includes('m')) p *= 1000000000;
                        if (priceMatch[2].toLowerCase().includes('j')) p *= 1000000;
                        
                        // Calcul surface
                        const s = surfaceMatch ? parseFloat(surfaceMatch[1].replace(/,/g, '').replace(/\./g, '')) : 0;
                        
                        // FILTRE : 1000m2 à 30000m2
                        if (s >= 1000 && s <= 30000) {
                            const pm2 = Math.round(p / s);
                            items.push({
                                title: text.split('\n')[0].substring(0, 100),
                                price: priceMatch[0],
                                surface: s,
                                pricem2: pm2,
                                location: text.split('\n').slice(0, 5).join(' ').replace(/,/g, ' '),
                                link: link
                            });
                        }
                    }
                } catch (e) {}
            });
            return items;
        });

        if (listings.length > 0) {
            log.info(`✅ ${listings.length} annonces valides sur cette page !`);
            await csvWriter.writeRecords(listings);
        }
    },
});

await crawler.run(startUrls);
