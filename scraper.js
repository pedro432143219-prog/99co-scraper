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
    // IMPORTANT : On force 1 seule page à la fois pour éviter le blocage 429
    maxConcurrency: 1, 
    
    launchContext: { 
        launchOptions: { 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        } 
    },
    
    async requestHandler({ page, log, request }) {
        log.info(`🕵️ Simulation humaine pour : ${request.url}`);
        
        // Pause aléatoire entre 5 et 10 secondes pour ne pas paraître suspect
        const waitTime = Math.floor(Math.random() * 5000) + 5000;
        await new Promise(r => setTimeout(r, waitTime));

        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 90000 });
        
        // Scroll très lent
        await page.evaluate(async () => {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollBy(0, 1000);
        });

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
            log.info(`✅ Succès : ${listings.length} terrains capturés.`);
            await csvWriter.writeRecords(listings);
        }
    },
});

// On réduit à 3 pages pour le moment pour "reprendre la confiance" du site
await crawler.run([
    'https://www.99.co/id/jual/tanah/bali?page=1',
    'https://www.99.co/id/jual/tanah/bali?page=2',
    'https://www.99.co/id/jual/tanah/bali?page=3'
]);
