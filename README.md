# Shu extensions

Extensions for Shu, the audiobook player.

## Installing

In Shu, open **Addons → Add addon** and paste the raw link to [`index.json`](index.json): open
the file here on GitHub, press **Raw** and copy the address. The app lists the extensions in this
repository and you pick the ones you want. They update themselves when a new version lands here.

To install just one, paste the raw link to its file in `dist/` instead, for example
[`audiobook-catalog/dist/audiobook-catalog.js`](audiobook-catalog/dist/audiobook-catalog.js).

## Audiobook Catalog

Fills the home screen: what's trending, new audiobook releases, and the most read books of each
genre, plus browsing by genre and search. Book pages show the narrator, length, rating and series.

The lists come from [Open Library](https://openlibrary.org) (what people are reading) and the
audiobook details from Audible's public catalog. The catalog doesn't play anything by itself:
pressing Play on one of its books asks your source extensions for versions.

Settings:

- **Genres on Home**: which genre rows show up
- **Book language**: language of the trending and genre lists
- **Audible store**: where narrators, lengths, ratings and new releases come from

## Audiobook Scraper

A source: searches public indexers for audiobooks, and optionally your own Jackett or Prowlarr,
then plays them through a debrid service (Real-Debrid, AllDebrid, TorBox or Premiumize). You
need an account with one of them.

It finds versions of catalog books, and you can also search it directly.

Settings:

- **API keys** for the debrid services you use; with more than one, the app lets you pick per book
- **Search on**: which indexers to search
- **Minimum seeders**: hides results with few seeders
- **Jackett / Prowlarr**: a Torznab URL and API key, to add any indexer they support

## Development

Each extension is a small TypeScript project bundled into a single file with esbuild. You need
Node 24; `npm install` brings the rest.

```sh
cd audiobook-catalog     # or audiobook-scraper
npm install
npm test             # unit tests
npm run typecheck
npm run lint         # biome
npm run build        # dist/<name>.js
```

When releasing, commit the rebuilt `dist/` file, bump `version` in `src/index.ts`, `package.json`
and `index.json`, and add a line to the extension's `CHANGELOG.md`. The app picks up new versions
by itself. The extension API is described in the app's `docs/EXTENSIONS.md`.

## License

[GNU General Public License v3.0](LICENSE) or any later version.
