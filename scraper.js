const https = require('https');
const fs = require('fs');

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9',
            }
        };

        https.get(url, options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            
            if (res.statusCode === 301 || res.statusCode === 302) {
                console.log(`Redirection: ${res.headers.location}`);
                return fetchPage(res.headers.location).then(resolve).catch(reject);
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    console.log('Demarrage du scraper');
    
    try {
        const url = 'https://www.99.co/id/jual/tanah/bali';
        console.log(`URL: ${url}`);
        
        const html = await fetchPage(url);
        console.log(`Page recuperee: ${html.length} caracteres`);
        
        const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        
        if (!scriptMatch) {
            console.log('Donnees non trouvees');
            fs.writeFileSync('resultats.csv', 'Titre,Prix,Lien\n');
            return;
        }
        
        const jsonData = JSON.parse(scriptMatch[1]);
        const items = jsonData?.props?.pageProps?.initialState?.search?.result?.list || [];
        
        console.log(`Biens trouves: ${items.length}`);
        
        let csv = 'Titre,Prix,Lien\n';
        
        items.forEach(item => {
            const titre = (item.title || '').replace(/"/g, '""');
            const prix = item.attributes?.price || '';
            const lien = `https://www.99.co/id/properti/${item.slug}`;
            csv += `"${titre}","${prix}","${lien}"\n`;
        });
        
        fs.writeFileSync('resultats.csv', csv);
        console.log('Fichier CSV cree');
        
    } catch (error) {
        console.error('ERREUR:', error.message);
        fs.writeFileSync('resultats.csv', 'Titre,Prix,Lien\n');
        process.exit(1);
    }
}

run();
