/**
 * Hostnames (without leading "www.") that we treat as e-commerce links.
 * Match is suffix-based so subdomains (e.g. m.myntra.com) and country TLDs
 * captured here still resolve.
 */
const SHOPPING_DOMAINS = new Set<string>([
  "myntra.com",
  "amazon.in",
  "amazon.com",
  "flipkart.com",
  "ajio.com",
  "nykaa.com",
  "nykaafashion.com",
  "meesho.com",
  "tatacliq.com",
  "snapdeal.com",
  "shopsy.in",
  "jiomart.com",
  "firstcry.com",
  "pepperfry.com",
  "urbanladder.com",
  "lenskart.com",
  "boat-lifestyle.com",
  "croma.com",
  "reliancedigital.in",
  "decathlon.in",
  "decathlon.com",
  "h-m.com",
  "hm.com",
  "zara.com",
  "westside.com",
  "shoppersstop.com",
  "mamaearth.in",
  "thesouledstore.com",
  "bewakoof.com",
  "noise.in",
  "boult.audio",
  "snitch.co.in",
]);

export function isShoppingDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith("www.")) host = host.slice(4);

  for (const domain of SHOPPING_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}
