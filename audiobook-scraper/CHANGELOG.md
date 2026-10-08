# Changelog

## 1.1.0 - 2026-10-08

### New
- Finds versions of books from catalog extensions, so they can be played from their own page
  (title and author must match; single books rank above collections, translations and summaries)
- Translated editions ("Hindi Edition", "[Español]", Russian releases) rank below the original

### Removed
- The "Latest" and "Most seeded" rows. Home is for catalog extensions now; search still
  covers every indexer

## 1.0.0 - 2026-10-08

First release.

- Searches several public indexers, and optionally Jackett or Prowlarr
- Plays through Real-Debrid, AllDebrid, TorBox or Premiumize
- Matches files across services even when they are named differently (name, folder path, size,
  then chapter position)
