import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Build stamp. scripts/package-deploy.mjs passes HUBLY_BUILD_SHA/_TIME so the
// frontend and backend zips share one version; a plain `npm run build` falls
// back to asking git directly.
function buildInfo() {
  let sha = process.env.HUBLY_BUILD_SHA;
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (dirty) sha += '-dirty';
    } catch {
      sha = 'unknown';
    }
  }
  return { sha, time: process.env.HUBLY_BUILD_TIME || new Date().toISOString() };
}

// Emits dist/version.json so the live frontend's build can be checked with
// `curl https://hubly.eljincorp.com/version.json`.
function versionFile() {
  return {
    name: 'hubly-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(buildInfo()) + '\n' });
    }
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000'
    }
  }
});
