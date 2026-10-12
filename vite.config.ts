import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
	ssr: {
		noExternal: true,
		target: 'node',
	},
	build: {
		ssr: true,
		outDir: 'dist',
		rollupOptions: {
			input: resolve(import.meta.dirname, 'src/main.ts'),
			output: {
				entryFileNames: 'index.js',
				format: 'es',
			},
		},
		sourcemap: false,
		minify: true,
	},
});
