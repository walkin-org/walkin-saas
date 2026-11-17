import { readFile } from 'node:fs/promises';
import { pages } from '../client/pages.js';

const bar = '<span class="placeholder"></span>';
const fields = names => names.map(name =>
  '<div class="loading-field"><small>'+name+'</small><div class="field-outline"></div></div>'
).join('');

function list(rows,columns) {
  const row = '<div class="placeholder-row">'+bar.repeat(columns)+'</div>';
  return '<div class="'+(columns === 5 ? 'table-placeholders' : 'record-placeholders')+'">'+row.repeat(rows)+'</div>';
}

function preview(page) {
  switch (page.icon) {
    case 'overview':
      return '<div class="metrics">'+['API requests','Mean response','95th percentile','Server errors'].map(label =>
        '<div><small>'+label+'</small><span class="placeholder metric-placeholder"></span></div>').join('')+
        '</div><div class="overview-grid"><section class="panel"><h2>Request latency</h2><div class="chart-placeholder"></div></section><section class="panel"><h2>Runtime</h2>'+list(4,2)+'</section></div>';
    case 'logs': return '<section class="directory">'+list(5,5)+'</section>';
    case 'team': return '<section class="directory">'+list(3,2)+'</section>';
    case 'store': return '<div class="single"><section><div class="field-outline">Search storefronts</div>'+list(3,2)+'</section></div>';
    case 'add': return '<div class="single"><section>'+fields(['Storefront name','Market road','Nearby landmark','Façade photo'])+'</section></div>';
    default: throw new Error('Missing loading layout for '+page.path);
  }
}

export async function registerPages(app) {
  const template = await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const brand = '<strong class="brand"><span class="brandmark" aria-hidden="true">↗</span>walkin</strong>';
  function register(paths,title,markup) {
    const html = template.replace('<!-- initial page -->',markup).replace('<title>Walkin Studio','<title>'+title+' · Walkin Studio');
    app.get(paths,(_req,res) => res.type('html').send(html));
  }
  const status = title => '<span role="status" class="sr-only">Loading '+title+'</span>';
  register(['/','/index.html'],'Sign in','<header class="loginbar">'+brand+'</header><main class="login"><section><h1>Sign in</h1>'+status('sign in')+'<div aria-hidden="true">'+fields(['Email address','Password'])+'</div></section></main>');
  for (const [role,links] of Object.entries(pages)) {
    for (const page of links) {
      const title = page.icon === 'overview' ? 'Backend overview' : page.label;
      const nav = links.map(link => '<a href="'+link.path+'"'+(link === page ? ' aria-current="page"' : '')+'>'+link.label+'</a>').join('');
      const markup = '<div class="shell"><aside class="sidebar">'+brand+'<nav aria-label="Main navigation">'+nav+'</nav></aside>'+
        '<div class="workspace"><header class="topbar"><div class="crumb">'+(role === 'admin' ? 'Superadmin' : 'Collector')+'</div></header>'+
        '<main class="content"><div class="pagehead"><h1>'+title+'</h1></div>'+status(title)+'<div aria-hidden="true">'+preview(page)+'</div></main></div></div>';
      register(page === links[0] ? [page.path,page.path+'.html'] : page.path,title,markup);
    }
  }
}
