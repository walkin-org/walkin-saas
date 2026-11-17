import {readFile} from 'node:fs/promises';
import {openCatalog} from '../../models/catalog.js';

// Stable demo IDs make reruns safe. Existing rows and collector edits are retained.
const {road,storefronts} = JSON.parse(await readFile(new URL('./road.json',import.meta.url),'utf8'));
const db = await openCatalog();
await db.run(`INSERT INTO market_roads (id,market,area_type,name,start_label,end_label,length_m)
  VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
  [road.id,road.market,road.area_type,road.name,road.start_label,road.end_label,road.length_m]);
for (const shop of storefronts) {
  const bytes = await readFile(new URL(shop.facade,import.meta.url));
  await db.run(`INSERT INTO storefronts (id,name,market,landmark,created,mime,photo_bytes,road_id,road_side,offset_m,frontage_m)
    VALUES ($1,$2,$3,$4,$5,'image/png',$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
    [shop.id,shop.name,road.market,shop.landmark,new Date().toISOString(),bytes,road.id,shop.side,shop.offsetM,shop.frontageM]);
}
console.log('Demo market available at /api/mobile/roads/'+road.id+'/map');
