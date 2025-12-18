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
    // On simule un vrai utilisateur pour éviter le blocage
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },
    async requestHandler({ page, log }) {
        log.info(`Analyse de : ${page.url()}`);
        
        // Attendre que le contenu soit là
        await page.waitForSelector('h1', { timeout: 30000 });

        // MÉTHODE GÉNIE : Extraire les données du script __NEXT_DATA__
        const data = await page.executeScript(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (!script) return null;
            const json = JSON.parse(script.textContent);
            
            // On cherche la liste des annonces dans la structure complexe de Next.js
            const listings = json.props?.pageProps?.initialState?.search?.result?.list || 
                             json.props?.pageProps?.searchResults?.list || [];
            
            return listings.map(item => ({
                title: item.title || 'Sans titre',
                price: item.priceFormatted || (item.price ? `${item.price}` : '0'),
                link: item.url ? `https://www.99.co${item.url}` : ''
            }));
        });

        if (data && data.length > 0) {
            log.info(`✅ ${data.length} annonces trouvées !`);
            await csvWriter.writeRecords(data);
        } else {
            throw new Error("Aucune donnée trouvée. Le sélecteur ou la structure a changé.");
        }
    },
    // En cas d'échec
    failedRequestHandler({ request, log }) {
        log.error(`La requête ${request.url} a échoué trop de fois.`);
    },
});

await crawler.run(['https://www.99.co/id/jual/tanah/bali']);
