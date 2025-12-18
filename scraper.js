// scraper.js — test minimal pour CI
import fs from 'fs';

const header = ['Titre','Prix','Lien'];
const rows = [
  ['TEST terrain 1','1000000000','https://example.com/1'],
  ['TEST terrain 2','2000000000','https://example.com/2']
];

const csv = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');

fs.writeFileSync('resultats.csv', csv, 'utf8');
console.log('Wrote resultats.csv (' + csv.split('\n').length + ' lines)');

// create a small debug.html to test upload
fs.writeFileSync('debug.html', '<html><body>debug</body></html>','utf8');

process.exit(0);
