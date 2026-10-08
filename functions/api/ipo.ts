import { fetchIpoFeed } from '../../server/proxy.js';

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  try {
    const result = await fetchIpoFeed(new URL(request.url).search);
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': result.contentType, 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to reach the Sharesansar IPO/FPO feed.' }, { status: 502 });
  }
}
