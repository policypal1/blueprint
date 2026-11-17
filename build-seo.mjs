import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { loadEnv } from 'vite';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { publicPages, SITE_NAME, SITE_ORIGIN } from './seo-pages.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const env = loadEnv('production', root, 'VITE_');
const site = new URL(env.VITE_SITE_URL || SITE_ORIGIN);
if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
  throw new Error('VITE_SITE_URL must be the public HTTPS origin, without credentials or a page path.');
}
const preview = process.env.VERCEL_ENV === 'preview';
const shareImage = new URL('/planpatch-demo-poster.webp', site).href;
const escapeText = (value) => value.replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));
const meta = (name, content, property = 'name') => `<meta ${property}="${name}" content="${escapeText(content)}">`;
const jsonLd = (value) => `<script type="application/ld+json">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`;

const generated = await mkdtemp(path.join(root, '.seo-build-'));
try {
  const output = path.join(generated, 'public.mjs');
  await build({
    entryPoints: [path.join(root, 'PublicPage.jsx')],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    loader: { '.svg': 'dataurl' },
    define: { 'import.meta.env': JSON.stringify({
      VITE_PLANPATCH_SUPPORT_EMAIL: env.VITE_PLANPATCH_SUPPORT_EMAIL || '',
    }) },
  });
  const { default: PublicPage } = await import(pathToFileURL(output).href);
  const template = await readFile(path.join(dist, 'index.html'), 'utf8');
  if (!template.includes('<div id="root"></div>')) throw new Error('The page template changed.');

  await Promise.all(Object.entries(publicPages).map(async ([route, page]) => {
    const canonical = new URL(page.path, site).href;
    const markup = renderToStaticMarkup(React.createElement(PublicPage, {
      page: route, account: { signedIn: false },
    }));
    const head = [
      `<title>${escapeText(page.title)}</title>`,
      meta('description', page.description),
      `<link rel="canonical" href="${escapeText(canonical)}">`,
      meta('og:type', 'website', 'property'),
      meta('og:site_name', SITE_NAME, 'property'),
      meta('og:title', page.title, 'property'),
      meta('og:description', page.description, 'property'),
      meta('og:url', canonical, 'property'),
      meta('og:image', shareImage, 'property'),
      meta('og:image:alt', 'An imported floor plan displayed in the editor', 'property'),
      meta('twitter:card', 'summary_large_image'),
    ];
    if (preview || page.noindex) head.push(meta('robots', 'noindex, follow'));
    if (route === 'home') head.push(jsonLd({
      '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: site.href,
    }));

    const html = template
      .replace(/<meta\s+name="description"[^>]*>/, '')
      .replace(/<title>[^<]*<\/title>/, () => head.join('\n    '))
      .replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
    await writeFile(path.join(dist, route === 'home' ? 'index.html' : `${page.path.slice(1)}.html`), html);
  }));

  const pages = Object.values(publicPages).filter((page) => page.sitemap);
  const urls = pages.map((page) => `  <url><loc>${escapeText(new URL(page.path, site).href)}</loc></url>`);
  await Promise.all([
    writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site).href}\n`),
    writeFile(path.join(dist, 'sitemap.xml'), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
      '',
    ].join('\n')),
  ]);
  console.log(`Generated ${Object.keys(publicPages).length} public pages and a sitemap for ${site.origin}.`);
} finally {
  await rm(generated, { recursive: true, force: true });
}
