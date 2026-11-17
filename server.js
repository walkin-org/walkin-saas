import express from 'express';
import { fileURLToPath } from 'node:url';
import { openCatalog } from './models/catalog.js';
import { monitor } from './middlewares/monitor.js';
import { securityHeaders, handleError } from './middlewares/http.js';
import { apiRoutes } from './routes/api.js';
import { buildClient } from './client-build.js';
import { registerPages } from './routes/page-loading.js';

const catalog = await openCatalog();
const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
const report = monitor(app);
app.use('/api', await apiRoutes(catalog, report));
await buildClient(process.execArgv.includes('--watch'));
await registerPages(app);
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.use(handleError);
const server = app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log('Walkin Studio listening at http://127.0.0.1:' + server.address().port);
});
