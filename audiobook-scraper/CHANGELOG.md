# Changelog

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
