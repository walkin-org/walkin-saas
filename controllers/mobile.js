function mobileRecord(row) {
  const { id,name,market,landmark,created,mime } = row;
  return { id,name,market,landmark,created,photoUrl: mime ? '/api/mobile/storefronts/'+id+'/photo' : null };
}

export function mobileCatalog(catalog) {
  return {
    async list(req,res) {
      const {q = '',limit = '50',offset = '0'} = req.query;
      if (typeof q !== 'string' || q.length > 300 ||
          ![limit,offset].every(v => typeof v === 'string' && /^\d+$/.test(v) && Number.isSafeInteger(Number(v))) ||
          Number(limit) < 1 || Number(limit) > 100) {
        return res.status(400).json({error:'Use a search up to 300 characters, limit 1–100 and a nonnegative offset.'});
      }
      const rows = await catalog.list(null,q.trim(),{limit:Number(limit)+1,offset:Number(offset)});
      res.json({items:rows.slice(0,Number(limit)).map(mobileRecord),nextOffset:rows.length > Number(limit) ? Number(offset)+Number(limit) : null});
    },
    async detail(req,res) {
      const row = await catalog.get(req.params.id);
      if (!row) return res.status(404).json({error:'Storefront not found.'});
      res.json(mobileRecord(row));
    }
  };
}
