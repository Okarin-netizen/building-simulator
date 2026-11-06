import { defineConfig } from 'vite';

// GitHub Pages ではリポジトリ名のパスで公開されるため base を相対にする
export default defineConfig({
  base: './',
  test: {
    globals: true,
  },
} as any);
