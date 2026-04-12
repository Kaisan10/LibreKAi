import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite build for frontend JS only. Does NOT overwrite:
 * - public/ (static assets, index.html)
 * - Any EJS or server-rendered HTML (index is served by Express with nonce)
 *
 * Output goes to dist/. To use the build in production:
 * 1. Run: npm run build
 * 2. Serve dist/ (e.g. app.use('/dist', express.static('dist')))
 * 3. In your EJS/index, set script src to the built entry (see dist after build for exact path)
 */
export default {
  root: path.join(__dirname, 'public'),
  publicDir: false,
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: path.resolve(__dirname, 'public/js/index.js'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    sourcemap: true,
    target: 'esnext',
    minify: 'esbuild',
  },
  base: '/dist/',
};
