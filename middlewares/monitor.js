import { performance } from 'node:perf_hooks';

export function monitor(app) {
  const recent = [];
  let total = 0;
  let failures = 0;
  let sum = 0;
  let cpu = process.cpuUsage();
  let last = performance.now();
  let cpuPercent = 0;
  setInterval(() => {
    const elapsed = performance.now() - last;
    const used = process.cpuUsage(cpu);
    cpuPercent = Math.round((used.user + used.system) / (elapsed * 10));
    last = performance.now();
    cpu = process.cpuUsage();
  }, 5000).unref();
  app.use('/api', (req,res,next) => {
    const start = performance.now();
    const path = req.path;
    res.once('finish', () => {
      const ms = Math.round(performance.now() - start);
      total++;
      sum += ms;
      if (res.statusCode >= 500) failures++;
      recent.push({ time: new Date().toISOString(), method: req.method, path: path.slice(0,150), status: res.statusCode, ms, actor: req.user?.email || 'Guest' });
      if (recent.length > 200) recent.shift();
    });
    next();
  });
  return async function report(db) {
    const start = performance.now();
    await db.run('SELECT 1', []);
    const dbMs = Math.round(performance.now()-start);
    const samples = recent.map(entry => entry.ms).sort((a,b) => a-b);
    return { database: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', dbMs,
      media: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
      mailConfigured: Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM && process.env.APP_URL),
      uptime: Math.floor(process.uptime()), node: process.version, cpuPercent,
      memoryMiB: Math.round(process.memoryUsage().rss / 1048576), total, failures,
      meanMs: total ? Math.round(sum/total) : 0, p95Ms: samples[Math.ceil(samples.length*.95)-1] || 0,
      logs: recent.slice().reverse() };
  };
}
