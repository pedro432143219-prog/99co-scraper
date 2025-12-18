import { PlaywrightCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';

const csvWriter = createObjectCsvWriter({
    path: 'resultats.csv',
    header: [
        { id: 'title', title: 'Titre' },
        { id: 'price', title: 'Prix' },
        { id: 'link', title: 'Lien' }
    ]
});

const crawler = new PlaywrightCrawler({
    launchContext: { launchOptions: { headless: true } },
    async requestHandler({ page, log }) {
        log.info('Chargement de la page...');
        await page.goto('https://www.99.co/id/jual/tanah/bali', { waitUntil: 'networkidle', timeout: 60000 });

        // On extrait les données directement du script de la page
        const listings = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (!script) return [];
            const data = JSON.parse(script.textContent);
            const items = data.props?.pageProps?.initialState?.search?.result?.list || [];
            return items.map(i => ({
                title: i.title || 'Sans titre',
                price: i.priceFormatted || i.price || '0',
                link: 'https://www.99.co' + i.url
            }));
        });

        if (listings.length > 0) {
            log.info(`✅ ${listings.length} annonces trouvées !`);
            await csvWriter.writeRecords(listings);
        } else {
            // Si on ne trouve rien, on enregistre une ligne d'erreur pour ne pas avoir un CSV vide
            await csvWriter.writeRecords([{ title: 'ERREUR', price: '0', link: 'Aucune donnée trouvée' }]);
            throw new Error('Aucune annonce trouvée. Le site a peut-être changé sa structure.');
        }
    },
});

await crawler.run();
