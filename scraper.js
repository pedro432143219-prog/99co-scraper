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
        log.info('Attente du chargement complet...');
        // On attend que le réseau soit calme pour être sûr que le JSON est là
        await page.waitForLoadState('networkidle');
        
        const listings = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (!script) return [];
            
            const data = JSON.parse(script.textContent);
            
            // On essaie plusieurs chemins possibles pour trouver les annonces
            const items = data.props?.pageProps?.initialState?.search?.result?.list || 
                          data.props?.pageProps?.searchResults?.list || 
                          data.props?.pageProps?.data?.listings || [];
                          
            return items.map(i => ({
                title: i.title || 'Titre inconnu',
                price: i.priceFormatted || (i.price ? i.price.toString() : '0'),
                link: i.url ? 'https://www.99.co' + i.url : 'Pas de lien'
            }));
        });

        if (listings.length > 0) {
            log.info(`✅ GENIAL : ${listings.length} annonces extraites !`);
            await csvWriter.writeRecords(listings);
        } else {
            log.error('❌ Le fichier sera vide car aucune annonce n’a été trouvée dans le JSON.');
            // On crée une ligne de debug pour comprendre dans le CSV ce qui manque
            await csvWriter.writeRecords([{ title: 'DEBUG: Aucune donnée trouvée', price: '0', link: 'Vérifier la structure du site' }]);
        }
    },
});

await crawler.run(['https://www.99.co/id/jual/tanah/bali']);
