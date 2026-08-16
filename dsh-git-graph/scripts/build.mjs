// Builds the generated artifacts from lib/graph.js — the SINGLE source of
// truth for the commit-graph rendering:
//   - lib/client.js         (browser bundle, from src/client.template.js)
//   - preview/preview.html  (offline demo, from src/preview.template.html)
//
// lib/graph.js is pure ESM. To inline it into the two non-module artifacts,
// we strip the `export ` keyword from each top-level declaration, turning it
// into plain declarations that share the enclosing scope.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const graphCode = readFileSync(join(root, 'lib', 'graph.js'), 'utf8')
  .replace(/^export /gm, '')

const MARKER = '/*__GRAPH_CODE__*/'

function render(templateRel, outRel) {
  const template = readFileSync(join(root, templateRel), 'utf8')
  if (!template.includes(MARKER)) {
    throw new Error(`${templateRel} is missing the ${MARKER} marker`)
  }
  const out = template.replace(MARKER, graphCode)
  const outPath = join(root, outRel)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, out)
  console.log(`wrote ${outRel}`)
}

render('src/client.template.js', 'lib/client.js')
render('src/preview.template.html', 'preview/preview.html')
