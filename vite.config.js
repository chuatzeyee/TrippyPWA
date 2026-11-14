import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Chunks (by name) that must be available offline from the first launch on top
// of the entry: the trip view and what it needs to load a trip and the session.
const PRECACHE_CHUNKS = new Set(['trip-detail', 'trip-repository', 'auth', 'auth-ui', 'user-prefs', 'locale', 'trip-extras'])

// Stamps public/sw.js with this build's id and file list, so each release ships
// a changed service worker (that is how browsers notice an update) and the
// worker can precache the core files and drop old ones.
function serviceWorkerManifest() {
  let files = []
  let precache = []
  return {
    name: 'trippy-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const items = Object.values(bundle)
      files = items.map(f => f.fileName).filter(n => n.startsWith('assets/')).sort()
      const byFile = new Map(items.map(f => [f.fileName, f]))
      const wanted = new Set()
      const visit = (fileName) => {
        const chunk = byFile.get(fileName)
        if (!chunk || wanted.has(fileName)) return
        wanted.add(fileName)
        if (chunk.type !== 'chunk') return
        for (const css of chunk.viteMetadata?.importedCss || []) wanted.add(css)
        for (const dep of chunk.imports || []) visit(dep)
      }
      for (const f of items) {
        if (f.type === 'chunk' && (f.isEntry || PRECACHE_CHUNKS.has(f.name))) visit(f.fileName)
      }
      // Stylesheets linked from index.html (some load lazily via media="print").
      for (const f of items) if (f.type === 'asset' && f.fileName.endsWith('.css')) wanted.add(f.fileName)
      precache = [...wanted].filter(n => n.startsWith('assets/')).sort()
    },
    async writeBundle(options) {
      const swPath = join(options.dir, 'sw.js')
      let source
      try { source = await readFile(swPath, 'utf8') } catch { return }
      const buildId = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const stamped = source
        .replace("const BUILD_ID = 'dev';", `const BUILD_ID = '${buildId}';`)
        .replace('const BUILD_ASSETS = [];', `const BUILD_ASSETS = ${JSON.stringify(files)};`)
        .replace('const PRECACHE_ASSETS = [];', `const PRECACHE_ASSETS = ${JSON.stringify(precache)};`)
      if (stamped === source) this.warn('sw.js placeholders not found; service worker not stamped')
      await writeFile(swPath, stamped)
    },
  }
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: process.env.GH_PAGES ? '/TrippyPWA/' : '/',
  plugins: [serviceWorkerManifest()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep the bundler's small runtime helpers in their own chunk. Left to
          // automatic chunking they can land inside a large lazy chunk (the PDF
          // exporter), which every trip view then had to download.
          groups: [{ name: 'runtime', test: /rolldown[\\/]runtime/ }],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false
  }
})
