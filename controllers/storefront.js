import { randomUUID } from 'node:crypto';
import { storefrontFields } from '../models/catalog.js';

function readPhoto(photo) {
  if (photo === '' || photo === undefined) return {bytes:null,mime:null};
  if (typeof photo !== 'string') return {error:'Invalid photo.',status:400};
  const bytes = Buffer.from(photo,'base64');
  if (bytes.length > 5*1024*1024) return {error:'Choose a photo under 5 MiB.',status:413};
  let mime;
  if (bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) mime='image/png';
  if (bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) mime='image/jpeg';
  if (!mime || bytes.toString('base64') !== photo) return {error:'Choose a JPEG or PNG photo.',status:400};
  return {bytes,mime};
}

export function storefrontController(catalog) {
  return {
    detail: (req,res) => res.json(req.storefront),
    async list(req,res) {
      const q = req.query.q ?? '';
      if (typeof q !== 'string' || q.length > 300) return res.status(400).json({error:'Search must be up to 300 characters.'});
      res.json(await catalog.list(req.user.role === 'collector' ? req.user.id : null,q.trim()));
    },
    async photo(req,res) {
      const photo = await catalog.photo(req.params.id);
      if (!photo) return res.status(404).json({error:'No photo.'});
      res.type(photo.mime).send(Buffer.from(photo.photo_bytes));
    },
    async update(req,res) {
      const {name,market,landmark} = req.details;
      const photo = readPhoto(req.body.photo);
      if (photo.error) return res.status(photo.status).json({error:photo.error});
      let sql = 'UPDATE storefronts SET name=$1,market=$2,landmark=$3,mime=COALESCE($4,mime),photo_bytes=COALESCE($5,photo_bytes)';
      const args = [name,market,landmark,photo.mime,photo.bytes];
      if ('road_id' in req.details) {
        sql += ',road_id=$6,road_side=$7,offset_m=$8,frontage_m=$9';
        args.push(req.details.road_id,req.details.road_side,req.details.offset_m,req.details.frontage_m);
      }
      args.push(req.params.id);
      const rows = await catalog.run(sql+' WHERE id=$'+args.length+' AND archived=0 RETURNING '+storefrontFields,args);
      if (!rows.length) return res.status(404).json({error:'Storefront not found.'});
      res.json(rows[0]);
    },
    async archive(req,res) {
      await catalog.run('UPDATE storefronts SET archived=1 WHERE id=$1',[req.params.id]);
      res.sendStatus(204);
    },
    async create(req,res) {
      const photo = readPhoto(req.body.photo);
      if (photo.error) return res.status(photo.status).json({error:photo.error});
      const id = randomUUID();
      const row = { id, ...req.details, created: new Date().toISOString(), mime:photo.mime || '', owner:req.user.email, owner_user_id:req.user.id };
      await catalog.add(row,photo.bytes);
      res.status(201).json(row);
    }
  };
}
