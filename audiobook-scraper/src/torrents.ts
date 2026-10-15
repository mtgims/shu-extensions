import { torrent } from './debrid/torrent.ts';
import { makeExtension } from './extension.ts';
import { useServices } from './services.ts';

useServices({ torrent });

const extension = makeExtension({
  id: 'community.audiobook-torrents',
  name: 'Audiobook Torrents',
  updateUrl:
    'https://raw.githubusercontent.com/mtgims/shu-extensions/main/audiobook-scraper/dist/audiobook-torrents.js',
  description:
    'Finds audiobook torrents on AudioBook Bay, The Pirate Bay and RuTracker (through Knaben) and plays them directly, with no account. Your IP address is visible to everyone sharing the book; a VPN is strongly advised.',
  notice:
    'Playing a torrent connects this device directly to the other people sharing the book, so your IP address is visible to all of them.\n\nHow fast a book starts and plays depends on how many people share it: a book few people share may be slow or not play at all.\n\nUsing a VPN is strongly advised.',
  settings: [
    {
      key: 'downloadFolder',
      label: 'Download folder',
      type: 'folder',
      help: 'Shu keeps what it downloads here, in a “Shu torrents” folder, in its own format (not as playable files). Books downloaded before stay where they are.',
    },
    {
      key: 'deleteWhenFinished',
      label: 'Delete a book when you finish it',
      type: 'toggle',
      default: true,
      help: 'Also when you remove it from your library.',
    },
    {
      key: 'keepDays',
      label: 'Delete books not played for',
      type: 'select',
      default: '30',
      options: [
        { value: '7', label: '7 days' },
        { value: '30', label: '30 days' },
        { value: '90', label: '90 days' },
        { value: 'forever', label: 'Never' },
      ],
    },
    {
      key: 'storageLimit',
      label: 'Space for downloads',
      type: 'select',
      default: '5',
      help: 'Above this, the books played longest ago are deleted first.',
      options: [
        { value: '1', label: '1 GB' },
        { value: '2', label: '2 GB' },
        { value: '5', label: '5 GB' },
        { value: '10', label: '10 GB' },
        { value: '0', label: 'No limit' },
      ],
    },
    {
      key: 'downloadLimit',
      label: 'Download speed',
      type: 'select',
      default: '0',
      options: [
        { value: '0', label: 'No limit' },
        { value: '1024', label: '1 MB/s' },
        { value: '5120', label: '5 MB/s' },
      ],
    },
    {
      key: 'uploadLimit',
      label: 'Upload speed',
      type: 'select',
      default: '0',
      help: 'While a book plays, Shu shares the parts it has with others, as every torrent app does.',
      options: [
        { value: '0', label: 'No limit' },
        { value: '50', label: '50 KB/s' },
        { value: '200', label: '200 KB/s' },
        { value: '1024', label: '1 MB/s' },
      ],
    },
    {
      key: 'shareAfterDownload',
      label: 'Keep sharing while Shu is open',
      type: 'toggle',
      default: false,
      help: 'Off: sharing stops a few minutes after you stop listening.',
    },
  ],
  noServiceMessage: 'This extension plays torrents in the app; it needs Shu 0.6.0 or later.',
});

(globalThis as unknown as { extension: typeof extension }).extension = extension;
