import { randomUUID } from 'node:crypto';

const roadFields = 'id,market,area_type,name,start_label,end_label,length_m';
const fail = (res,error) => res.status(400).json({error});

export function marketRoads(db) {
  const get = async id => (await db.run('SELECT '+roadFields+' FROM market_roads WHERE id=$1',[id]))[0];
  return {
    list: async (_req,res) => res.json(await db.run('SELECT '+roadFields+' FROM market_roads ORDER BY market,name,id',[])),
    async create(req,res) {
      const {market,name,start_label,end_label,area_type,length_m} = req.body || {};
      if (![market,name,start_label,end_label].every(s => typeof s === 'string' && s.trim() && s.trim().length<=120) ||
          !['business_market','shopping_area'].includes(area_type) || !Number.isFinite(length_m) || length_m<=0 ||
          start_label.trim().toLowerCase() === end_label.trim().toLowerCase()) return fail(res,'Enter a market, road, distinct start and end, area type and positive road length.');
      const rows = await db.run('INSERT INTO market_roads ('+roadFields+') VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(market,name) DO NOTHING RETURNING '+roadFields,
        [randomUUID(),market.trim(),area_type,name.trim(),start_label.trim(),end_label.trim(),length_m]);
      if (!rows.length) return res.status(409).json({error:'This road already exists in the market.'});
      res.status(201).json(rows[0]);
    },
    async placement(req,res,next) {
      const p = req.body.placement;
      if (p === undefined && req.storefront?.road_id) {
        if (req.details.market !== req.storefront.market) return fail(res,'Select a road in the new market or clear the placement.');
        return next();
      }
      if (p == null) {
        Object.assign(req.details,{road_id:null,road_side:null,offset_m:null,frontage_m:null});
        return next();
      }
      if (typeof p.roadId !== 'string' || !['left','right'].includes(p.side) ||
          !Number.isFinite(p.offsetM) || p.offsetM<0 || !Number.isFinite(p.frontageM) || p.frontageM<=0) return fail(res,'Choose a road, a side, a nonnegative offset and a positive frontage width.');
      const road = await get(p.roadId);
      if (!road || road.market !== req.details.market || p.offsetM+p.frontageM>road.length_m) return fail(res,'The façade must fit within a road in the selected market.');
      Object.assign(req.details,{road_id:road.id,road_side:p.side,offset_m:p.offsetM,frontage_m:p.frontageM});
      next();
    },
    async map(req,res) {
      const road = await get(req.params.roadId);
      if (!road) return res.status(404).json({error:'Road not found.'});
      const rows = await db.run(`SELECT id,name,landmark,road_side,offset_m,frontage_m,mime FROM storefronts
        WHERE road_id=$1 AND archived=0 ORDER BY offset_m,id`,[road.id]);
      const sides = {left:[],right:[]};
      for (const row of rows) sides[row.road_side].push({
        storefrontId:row.id,name:row.name,landmark:row.landmark,offsetM:row.offset_m,frontageM:row.frontage_m,
        facadeUrl:row.mime ? '/api/mobile/storefronts/'+row.id+'/photo' : null
      });
      res.json({road,...sides});
    }
  };
}
