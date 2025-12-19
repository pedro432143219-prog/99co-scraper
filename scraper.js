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
    maxConcurrency: 1,
    // On augmente le temps d'attente car le site te surveille
    requestHandlerTimeoutSecs: 120, 
    
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled', // Cache le fait que c'est un robot
            ],
        },
    },

    async requestHandler({ page, log, request }) {
        log.info(`🕵️ Tentative d'accès discret : ${request.url}`);
        
        // On imite un navigateur humain (User-Agent aléatoire)
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.google.com/'
        });

        // Navigation avec une attente plus longue
        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 90000 });
        
        // Pause "lecture" pour simuler un humain
        await new Promise(r => setTimeout(r, 8000));

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
            log.info(`✅ RÉUSSI : ${listings.length} terrains trouvés.`);
            await csvWriter.writeRecords(listings);
        } else {
            log.error('❌ Accès réussi mais aucune donnée lue. Le site a peut-être changé de structure.');
        }
    },
});

// TEST : On ne tente QUE la page 1 pour ne pas griller l'IP
await crawler.run(['https://www.99.co/id/jual/tanah/bali?page=1']);
