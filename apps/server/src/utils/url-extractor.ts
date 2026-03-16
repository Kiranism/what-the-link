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
    })
    .map((url) => normalizeUrl(url));
}

export function extractHashtags(text: string): string[] {
  const matches = text.matchAll(HASHTAG_REGEX);
  const tags = new Set<string>();
  for (const match of matches) {
    if (match[1]) tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}


const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "ref_url",
  "si",
  "feature",
  "s",
  "t",
]);

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);

    // Strip tracking parameters
    for (const param of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(param)) {
        parsed.searchParams.delete(param);
      }
    }

    // Remove empty search string (when all params were stripped)
    let result = parsed.toString();
    if (parsed.searchParams.size === 0) {
      result = result.replace(/\?$/, "");
    }

    // Remove trailing slash from path (but keep root "/")
    result = result.replace(/\/(\?|#|$)/, "$1");

    return result;
  } catch {
    return withProtocol;
  }
}
