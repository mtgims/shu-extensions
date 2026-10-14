# Changelog

## 1.4.0 - 2026-10-14

### New
- Audiobook language setting: versions in your language are no longer marked as poor matches,
  and versions that say they're in another language are

### Changed
- "Translation" is now "Other language"
- The Knaben option now says what it adds for audiobooks: RuTracker. Its API no longer returns
  1337x and the other sites it used to list
- English audiobooks from RuTracker can be clear matches now; the Russian copy of the title
  they carry no longer counts against them

### Fixed
- Results from Knaben's second Pirate Bay mirror showed up twice, labeled "(proxy v2)"
- With Real-Debrid, torrents from Knaben or Jackett/Prowlarr came out as one chapter (just the
  biggest file). Opening such a book now adds it to your Real-Debrid account to read its files
- A torrent Real-Debrid or AllDebrid gave up on (dead, failed, timed out) showed as
  "downloading" forever; it's now an error, so the next version gets a try
- A torrent you deleted on Real-Debrid's site no longer fails until the app restarts; it's
  added again

## 1.3.0 - 2026-10-13

### New
- Each version says how sure the match is, so the app can play a clear match right away and
  ask which one to play when none is clear

## 1.2.0 - 2026-10-13

### New
- Each version found for a catalog book says why it matches or doesn't: "Same narrator",
  "Length matches", "Different narrator", "Too small for the whole book", "Possibly a
  collection", "Different author", "Abridged"

### Changed
- Better picks for catalog books:
  - words in a release name that aren't the title, author or narrator count against it, so
    "Dune Messiah" no longer passes for "Dune"
  - the catalog's narrator ranks first
  - a size far off the book's length ranks low (samples, single parts, hidden collections)
  - another author with the same surname, abridged readings and radio dramas rank low

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
