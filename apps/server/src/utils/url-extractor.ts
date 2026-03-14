const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const HASHTAG_REGEX = /#(\w+)/g;

export function extractURLs(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];

  return matches
    .map((url) => url.replace(/[.,;!?)]+$/, ""))
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

export function extractHashtags(text: string): string[] {
  const matches = text.matchAll(HASHTAG_REGEX);
  const tags = new Set<string>();
  for (const match of matches) {
    if (match[1]) tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

export function detectFavorite(text: string): boolean {
  return text.includes("!fav") || text.includes("\u2B50") || text.includes("\u2606");
}
