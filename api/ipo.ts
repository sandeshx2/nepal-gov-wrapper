import { fetchIpoFeed } from '../server/proxy.js';
import type { VercelRequest, VercelResponse } from '../server/vercel.js';

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  try {
    const result = await fetchIpoFeed(new URL(request.url, `https://${request.headers.host}`).search);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    response.status(result.status).send(result.body);
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to reach the Sharesansar IPO/FPO feed.' });
  }
}
