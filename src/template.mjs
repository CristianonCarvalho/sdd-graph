// speckit-graph — monta o HTML final injetando dados, D3 e nome do projeto.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CDN_D3 = 'https://cdn.jsdelivr.net/npm/d3@7';

function esc(s) {
  // segura para inserir dentro de <script> sem fechar a tag
  return String(s).replace(/<\/script/gi, '<\\/script');
}

/**
 * @param {object} data  saída de parseSpecs()
 * @param {object} opts  { project, selfContained }
 * @returns {string} HTML completo
 */
export function renderHTML(data, opts = {}) {
  const { project = 'meu-projeto', selfContained = true, timeline = null } = opts;
  let html = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');

  let d3Block;
  if (selfContained) {
    const d3 = fs.readFileSync(path.join(ROOT, 'assets', 'd3.min.js'), 'utf8');
    d3Block = `<script>${esc(d3)}</script>`;
  } else {
    d3Block = `<script src="${CDN_D3}"></script>`;
  }
  const dataBlock = `<script>window.SPECKIT_DATA = ${esc(JSON.stringify(data))};</script>`;
  const timelineBlock = timeline ? `<script>window.SPECKIT_TIMELINE = ${esc(JSON.stringify(timeline))};</script>` : '';

  // funções de substituição evitam a interpolação de $& / $` / $' etc.
  // que corromperia conteúdo contendo "$" (o D3 minificado usa muito).
  html = html
    .replace('<!--__D3__-->', () => d3Block)
    .replace('<!--__DATA__-->', () => dataBlock)
    .replace('<!--__TIMELINE__-->', () => timelineBlock)
    .replace('<!--__PROJECT__-->', () => esc(project));
  return html;
}
