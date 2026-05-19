import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// Stamp the build with a timestamp so the running bundle can compare
// itself against `/version.json` and prompt the user to refresh when
// a newer deploy is live. Targets the Android-Chrome bfcache /
// tab-persistence case (S24) where a tab opened before a deploy keeps
// serving the old JS in-memory even though CloudFront has the new one.
const buildId = String(Date.now())

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'emit-version-json',
      apply: 'build',
      writeBundle(opts) {
        const outDir = opts.dir || 'dist'
        fs.writeFileSync(
          path.join(outDir, 'version.json'),
          JSON.stringify({ buildId }) + '\n',
        )
      },
    },
  ],
})