const SOURCE = 'https://nepal.gov.np';
const SHARESANSAR = 'https://www.sharesansar.com';

export interface ProxyResponse {
  status: number;
  contentType: string;
  body: string;
}

export type OfficialFeed = 'updates' | 'loksewa';

export async function fetchOfficialFeed(path: OfficialFeed, search = ''): Promise<ProxyResponse> {
  const route = path === 'loksewa' ? '/api/loksewa' : '/api/updates';
  const response = await fetch(`${SOURCE}${route}${search}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (path === 'loksewa' && !response.ok) {
    return {
      status: response.status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: 'The Public Service Commission feed is currently unavailable.' }),
    };
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json',
    body: await response.text(),
  };
}

export async function fetchIpoFeed(search = ''): Promise<ProxyResponse> {
  const requestUrl = new URL('/category/ipo-fpo-news', SHARESANSAR);
  const incomingParams = new URLSearchParams(search);
  const cursor = incomingParams.get('cursor');
  if (cursor) requestUrl.searchParams.set('cursor', cursor);
  const response = await fetch(requestUrl, {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; NepalUpdates/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  if (!response.ok) return { status: response.status, contentType: 'application/json', body: JSON.stringify({ error: `Sharesansar returned ${response.status}` }) };

  const decoded = (value = '') => value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const items: Array<{ id: string; title: string; content: string; publishedDate: string; url: string; source: string }> = [];
  const seenUrls = new Set<string>();
  const articlePattern = /<div\b[^>]*class=["'][^"']*\bfeatured-news-list\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div class=["']clearfix["']><\/div>/gi;
  let match;
  while ((match = articlePattern.exec(html))) {
    const block = match[1];
    const anchor = block.match(/<a\b[^>]*href=["']([^"']*\/newsdetail\/[^"']+)["'][^>]*title=["']([^"']+)["']/i);
    const title = decoded(anchor?.[2] || block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '');
    if (!anchor || !title) continue;
    const url = new URL(anchor[1], SHARESANSAR).href;
    if (new URL(url).origin !== SHARESANSAR || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const dateMatch = block.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}/);
    items.push({ id: url, title, content: '', publishedDate: dateMatch?.[0] || '', url, source: 'Sharesansar' });
    if (items.length >= 30) break;
  }
  const nextLink = html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*rel=["']next["'][^>]*>\s*Next/i)
    || html.match(/<a\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const nextUrl = nextLink ? new URL(nextLink[1], requestUrl) : null;
  const nextCursor = nextUrl?.searchParams.get('cursor') || null;
  return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ items, nextCursor }) };
}
