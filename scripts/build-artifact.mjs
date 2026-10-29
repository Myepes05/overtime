// Bundles the Vite build into one self-contained HTML page for publishing as a claude.ai Artifact.
// The Artifact host adds <!doctype>/<html>/<head>/<body> itself and only allows Google Fonts as an
// external stylesheet, so the game's CSS and JS are inlined here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module"[^>]*src="\/?([^"]+)"/)?.[1];
const css = html.match(/<link rel="stylesheet"[^>]*href="\/?(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('Could not find the built script or stylesheet in dist/index.html');

// keep "</script" inside the bundle from closing the inline tag
const code = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(dist, css), 'utf8');

const page = `<title>Overtime</title>
<meta name="theme-color" content="#1C2230">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
/* Overtime commits to one look (the approved paper-and-ink HUD), in light and dark viewer themes alike. */
:root { color-scheme: light; }
${style}
</style>
<canvas id="game"></canvas>
<div id="touch-layer"></div>
<div id="ui"></div>
<script type="module">
${code}
</script>
`;

mkdirSync('artifact', { recursive: true });
writeFileSync(join('artifact', 'overtime.html'), page);
console.log(`artifact/overtime.html  ${(page.length / 1024).toFixed(0)} kB`);
