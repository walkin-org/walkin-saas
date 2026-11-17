import { build, context } from 'esbuild';

export async function buildClient(watch = false) {
  const options = {
    entryPoints: ['client/main.jsx'],
    outfile: 'public/dist/app.js',
    bundle: true,
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }
  };
  if (watch) {
    const compiler = await context(options);
    await compiler.rebuild();
    await compiler.watch();
  } else await build(options);
}
if (import.meta.main) await buildClient();
