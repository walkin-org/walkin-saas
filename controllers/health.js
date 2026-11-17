export function healthController(catalog, report) {
  return {
    async ready(_req,res) {
      try { await catalog.run('SELECT 1', []); res.json({ status:'ready' }); }
      catch { res.status(503).json({ status:'unavailable' }); }
    },
    overview: async (_req,res) => res.json(await report(catalog)),
    async logs(req,res) {
      const logs = (await report(catalog)).logs;
      res.json(req.query.errors === 'true' ? logs.filter(entry => entry.status >= 400) : logs);
    }
  };
}
