// GET /api/heatmap?user=octocat&theme=sand → SVG image of the 3D heatmap.
// Made for GitHub READMEs: ![](https://your-site/api/heatmap?user=octocat)
import { parseOptions } from '../src/lib/options.js';
import { fetchContributions, sampleContributions } from '../src/lib/data.js';
import { renderSvg, renderMessageSvg } from '../src/lib/svg.js';

export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const opts = parseOptions(params);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  try {
    const days = opts.user ? await fetchContributions(opts.user, opts.year) : sampleContributions(opts.year);
    // GitHub's image proxy respects these; refresh hourly, serve stale for a day while refreshing
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(renderSvg(days, opts));
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.statusCode = 200; // still return an image so the README shows the message
    res.end(renderMessageSvg(err.message, opts.theme));
  }
}
