// YTS genre whitelist — shared by `components/PopularMoviesPanel.tsx` (UI dropdown)
// and `app/api/yts/popular/route.ts` (param validation) so the two lists can't drift.
// YTS is case-sensitive on this parameter.
export const YTS_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
] as const;

export type YtsGenre = typeof YTS_GENRES[number];

export const YTS_GENRE_SET: ReadonlySet<string> = new Set(YTS_GENRES);
