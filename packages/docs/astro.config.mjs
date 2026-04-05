import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'NetCrawl Docs',
      description: 'SDK Reference & Game Guide for NetCrawl',
      defaultLocale: 'en',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/netcrawl/netcrawl2' },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'SDK Reference',
          autogenerate: { directory: 'sdk-reference' },
        },
        {
          label: 'Game Guide',
          autogenerate: { directory: 'game-guide' },
        },
      ],
    }),
  ],
});
