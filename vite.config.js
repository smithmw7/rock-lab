import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let config;
  return {
    // Relative assets also work on a fork's GitHub Pages project path.
    base: './',
    define: {
      'import.meta.env.VITE_AUDIO_LIBRARY': JSON.stringify(
        command === 'serve' && mode !== 'public' ? env.VITE_AUDIO_LIBRARY || 'public' : 'public',
      ),
    },
    build: { copyPublicDir: false },
    plugins: [{
      name: 'publish-public-assets',
      apply: 'build',
      configResolved(resolved) { config = resolved; },
      writeBundle() {
        const source = config.publicDir;
        if (!source || !existsSync(source)) return;
        const destination = path.resolve(config.root, config.build.outDir);
        mkdirSync(destination, { recursive: true });
        cpSync(source, destination, {
          recursive: true,
          filter(file) {
            const relative = path.relative(source, file).split(path.sep).join('/');
            return relative !== 'audio/private' && !relative.startsWith('audio/private/')
              && relative !== 'reference.png' && path.basename(file) !== '.DS_Store';
          },
        });
      },
    }],
  };
});
