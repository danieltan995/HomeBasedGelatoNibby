import { defineConfig } from 'astro/config';

export default defineConfig({
	output: 'static',
	site: 'https://danieltan995.github.io',
	base: process.env.GITHUB_ACTIONS ? '/HomeBasedGelatoNibby' : '/',
	devToolbar: { enabled: false },
});