/** What the app shows in lists (see the app's docs/EXTENSIONS.md). */
export interface Summary {
  id: string;
  title: string;
  authors?: string[];
  narrators?: string[];
  cover?: string;
  tags?: string[];
  details?: string;
}

/** A book page. No chapters: playable versions come from source extensions. */
export interface Work extends Summary {
  description?: string;
  year?: string;
  durationMinutes?: number;
  rating?: number;
  genres?: string[];
  series?: string;
  chapters: [];
}
