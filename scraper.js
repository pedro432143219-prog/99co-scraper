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
    // On force le mode sans tête pour GitHub
    launchContext: { launchOptions: { headless: true } },
    async requestHandler({ page, log }) {
        log.info(`Analyse de la page...`);
        
        // On attend que la page soit chargée
        await page.waitForLoadState('networkidle');

        // On extrait les données depuis le script interne __NEXT_DATA__ (le secret des pros)
        const listings = await page.evaluate(() => {
            const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
            // On va chercher dans la structure spécifique de 99.co
            const list = data.props?.pageProps?.initialState?.search?.result?.list || [];
            return list.map(item => ({
                title: item.title,
                price: item.priceFormatted || item.price,
                link: `https://www.99.co${item.url}`
            }));
        });

        if (listings.length > 0) {
            log.info(`✅ ${listings.length} annonces trouvées !`);
            await csvWriter.writeRecords(listings);
        } else {
            log.error('❌ Aucune annonce trouvée dans le JSON.');
            process.exit(1); // Force l'erreur pour voir le log dans GitHub
        }
    }
});

await crawler.run(['https://www.99.co/id/jual/tanah/bali']);
