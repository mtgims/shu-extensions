import { DEBRID } from './debrid/index.ts';
import { makeExtension } from './extension.ts';
import { useServices } from './services.ts';

const debridHelp = 'Leave empty if you don’t use it.';

useServices(DEBRID);

const extension = makeExtension({
  id: 'community.audiobook-scraper',
  name: 'Audiobook Scraper',
  updateUrl:
    'https://raw.githubusercontent.com/mtgims/shu-extensions/main/audiobook-scraper/dist/audiobook-scraper.js',
  description:
    'Finds audiobook torrents on AudioBook Bay, The Pirate Bay and RuTracker (through Knaben), and plays them through Real-Debrid, AllDebrid, TorBox or Premiumize.',
  settings: [
    { key: 'torbox', label: 'TorBox API key', type: 'password', help: debridHelp },
    { key: 'realdebrid', label: 'Real-Debrid API key', type: 'password', help: debridHelp },
    { key: 'alldebrid', label: 'AllDebrid API key', type: 'password', help: debridHelp },
    { key: 'premiumize', label: 'Premiumize API key', type: 'password', help: debridHelp },
  ],
  noServiceMessage: 'Add a debrid API key in this extension’s settings to play audiobooks.',
});

(globalThis as unknown as { extension: typeof extension }).extension = extension;
