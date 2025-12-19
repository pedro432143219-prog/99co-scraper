import { PlaywrightCrawler } from 'crawlee';
import { createObjectCsvWriter } from 'csv-writer';

// ================= CONFIG CSV =================
const csvWriter = createObjectCsvWriter({
    path: 'resultats.csv',
    header: [
        { id: 'title', title: 'Titre' },
        { id: 'price', title: 'Prix' },
        { id: 'link', title: 'Lien' },
        { id: 'location', title: 'Localisation' }
    ]
});

// ================= CRAWLER =================
const crawler = new PlaywrightCrawler({
    // On garde le headless true pour GitHub Actions
    launchContext: { 
        launchOptions: { 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Options vitales pour Linux/GitHub
        } 
    },
    
    // On se fait passer pour un vrai navigateur Chrome Mac
    preNavigationHooks: [
        async ({ page }) => {
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            });
        }
    ],

    async requestHandler({ page, log }) {
        log.info(`Analyse de : ${page.url()}`);
        
        // 1. Navigation et attente intelligente
        await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        log.info('Attente du chargement des cartes...');
        // On attend qu'au moins un élément avec un prix apparaisse (indice visuel fort)
        try {
            // On attend n'importe quel élément qui pourrait être une carte. 
            // Les classes changent souvent, on vise large.
            await page.waitForSelector('div[class*="search-result"]', { timeout: 15000 });
        } catch (e) {
            log.warning("Timeout attente sélecteur, on tente l'extraction quand même.");
        }

        // 2. Scroll pour déclencher le chargement des images/données (Lazy loading)
        await page.evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight / 2);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollTo(0, document.body.scrollHeight);
        });

        // 3. EXTRACTION VISUELLE (DOM SCRAPING)
        // C'est la partie "Génie" : on utilise des sélecteurs génériques pour ne pas casser si une classe change
        const listings = await page.evaluate(() => {
            const items = [];
            // On cherche tous les liens qui ressemblent à des annonces
            // Souvent les cartes sont des liens <a> ou contiennent des liens
            const cards = Array.from(document.querySelectorAll('div[class*="card"], div[class*="listing"]'));

            cards.forEach(card => {
                try {
                    // On cherche le prix (texte qui contient Rp ou Miliar)
                    const priceEl = card.innerText.match(/Rp\s*[\d,.]+\s*(Miliar|Juta|Jt|M)/i);
                    const price = priceEl ? priceEl[0] : null;

                    // On cherche le titre (souvent un h1, h2, h3 ou bold)
                    const titleEl = card.querySelector('h1, h2, h3, h4, strong');
                    const title = titleEl ? titleEl.innerText.trim() : card.innerText.split('\n')[0];

                    // On cherche le lien
                    const linkEl = card.querySelector('a') || card.closest('a');
                    let link = linkEl ? linkEl.getAttribute('href') : null;
                    if (link && !link.startsWith('http')) link = 'https://www.99.co' + link;

                    // On cherche la localisation
                    const locText = card.innerText; 
                    // Extraction brute si on ne trouve pas mieux

                    // FILTRE : On ne garde que si on a un prix ET un lien (pour éviter les pubs)
                    if (price && link) {
                        items.push({
                            title: title || 'Titre Inconnu',
                            price: price,
                            link: link,
                            location: 'Bali' // Placeholder si non trouvé
                        });
                    }
                } catch (err) {
                    // Ignorer les erreurs sur une carte spécifique
                }
            });
            
            // Dédoublonnage basique basé sur le lien
            return items.filter((v,i,a)=>a.findIndex(t=>(t.link === v.link))===i);
        });

        if (listings.length > 0) {
            log.info(`✅ VICTOIRE : ${listings.length} annonces trouvées via le visuel !`);
            await csvWriter.writeRecords(listings);
        } else {
            log.error("❌ Toujours rien. Le site détecte peut-être le bot ou la structure HTML est trop complexe.");
            // On force une ligne d'erreur pour voir le CSV
            await csvWriter.writeRecords([{ title: 'ERREUR - CHECK LOGS', price: '0', link: page.url() }]);
        }
    },

    failedRequestHandler({ request, log }) {
        log.error(`Échec sur ${request.url}`);
    },
});

await crawler.run(['https://www.99.co/id/jual/tanah/bali']);
