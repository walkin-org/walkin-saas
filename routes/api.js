import express from 'express';
import { accessController } from '../controllers/access.js';
import { healthController } from '../controllers/health.js';
import { storefrontController } from '../controllers/storefront.js';
import { requireAdmin, requirePermanentPassword } from '../middlewares/access.js';
import { jsonRequests } from '../middlewares/http.js';
import { loadStorefront, validateDetails } from '../middlewares/storefront.js';
import { mobileCatalog } from '../controllers/mobile.js';
import { marketRoads } from '../controllers/roads.js';

export async function apiRoutes(catalog, report) {
  const router = express.Router();
  const access = await accessController(catalog);
  const health = healthController(catalog, report);
  const storefront = storefrontController(catalog);
  const json = express.json({ limit: '4kb' });

  router.get('/health', health.ready);
  router.use(jsonRequests);
  const mobile = express.Router();
  const feed = mobileCatalog(catalog);
  const roads = marketRoads(catalog);
  mobile.post('/register',json,access.registerConsumer);
  mobile.post('/login',json,access.mobileLogin);
  mobile.use(access.authenticateMobile);
  mobile.get('/me',access.me);
  mobile.post('/logout',access.mobileLogout);
  mobile.get('/storefronts',feed.list);
  mobile.get('/storefronts/:id',feed.detail);
  mobile.get('/storefronts/:id/photo',storefront.photo);
  mobile.get('/roads',roads.list);
  mobile.get('/roads/:roadId/map',roads.map);
  mobile.use((_req,res) => res.status(404).json({error:'Mobile route not found.'}));
  router.use('/mobile',mobile);
  router.post('/login', json, access.login);
  router.use(access.authenticate);
  router.get('/me', access.me);
  router.post('/logout', access.logout);
  router.post('/password', json, access.password);
  router.use(requirePermanentPassword);
  router.get('/roads',roads.list);
  router.post('/roads',json,roads.create);

  router.use('/admin', requireAdmin);
  router.get('/admin/overview', health.overview);
  router.get('/admin/logs', health.logs);
  router.get('/admin/collectors', access.listCollectors);
  router.post('/admin/collectors', json, access.invite);
  router.patch('/admin/collectors/:email', json, access.updateCollector);

  router.param('id', loadStorefront(catalog));
  router.get('/storefronts', storefront.list);
  router.post('/storefronts', express.json({ limit: '7mb' }), validateDetails, roads.placement, storefront.create);
  router.get('/storefronts/:id', storefront.detail);
  router.get('/storefronts/:id/photo', storefront.photo);
  router.put('/storefronts/:id', express.json({limit:'7mb'}), validateDetails, roads.placement, storefront.update);
  router.delete('/storefronts/:id', storefront.archive);
  router.use((_req,res) => res.status(404).json({error:'API route not found.'}));
  return router;
}
