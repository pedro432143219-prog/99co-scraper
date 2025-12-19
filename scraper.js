import { PlaywrightCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';

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

const crawler = new PlaywrightCrawler({
    maxConcurrency: 1, // Une seule page à la fois, obligatoirement
    requestHandlerTimeoutSecs: 180, 
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
        },
    },
    async requestHandler({ page, log, request }) {
        log.info(`🕵️ Navigation furtive : ${request.url}`);
        
        // Emulation d'un iPhone 14 pour contourner les protections desktop
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        // 1. Aller sur Google d'abord pour "nettoyer" le referer
        await page.goto('https://www.google.com', { waitUntil: 'networkidle' });
        await new Promise(r => setTimeout(r, 2000));

        // 2. Aller sur l'annonce
        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 90000 });
        
        // Pause "humaine" longue (15 secondes) pour laisser les scripts anti-bot se calmer
        await new Promise(r => setTimeout(r, 15000));

        const listings = await page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('div[class*="card"], div[class*="listing"]');
            cards.forEach(card => {
                const text = card.innerText;
                const priceMatch = text.match(/Rp\s*([\d,.]+)\s*(Miliar|Juta|Jt|M)/i);
                const surfaceMatch = text.match(/(\d+[\d,.]*)\s*(m²|m2|sqm)/i);
                const link = card.querySelector('a')?.href;

                if (priceMatch && link) {
                    let p = parseFloat(priceMatch[1].replace(/,/g, ''));
                    if (priceMatch[2].toLowerCase().includes('m')) p *= 1000000000;
                    if (priceMatch[2].toLowerCase().includes('j')) p *= 1000000;
                    const s = surfaceMatch ? parseFloat(surfaceMatch[1].replace(/,/g, '').replace(/\./g, '')) : 0;
                    
                    if (s >= 1000 && s <= 30000) {
                        items.push({
                            title: text.split('\n')[0].substring(0, 80),
                            price: priceMatch[0],
                            surface: s,
                            pricem2: Math.round(p / s),
                            location: text.split('\n').slice(0, 5).join(' ').replace(/,/g, ' '),
                            link: link
                        });
                    }
                }
            });
            return items;
        });

        if (listings.length > 0) {
            log.info(`✅ RÉUSSI : ${listings.length} terrains.`);
            await csvWriter.writeRecords(listings);
        }
    },
});

// ON NE TESTE QU'UNE PAGE POUR L'INSTANT
await crawler.run(['https://www.99.co/id/jual/tanah/bali?page=1']);
