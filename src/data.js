// Fetches a user's contribution calendar.
// Uses the public github-contributions-api (scrapes the public profile calendar, no token needed).
const API = 'https://github-contributions-api.jogruber.de/v4';

export async function fetchContributions(username, year) {
  const res = await fetch(`${API}/${encodeURIComponent(username)}?y=${year}`);
  if (!res.ok) {
    throw new Error(res.status === 404 ? `User "${username}" not found` : `Request failed (${res.status})`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  // [{ date: 'YYYY-MM-DD', count: number, level: 0-4 }]
  return json.contributions;
}

// Deterministic sample data so the scene isn't empty before a username is entered.
export function sampleContributions(year) {
  let seed = year * 9301;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const days = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const month = d.getUTCMonth();
    const activity = 0.25 + 0.6 * Math.sin((month / 11) * Math.PI); // busier mid-year
    const count = rand() < activity ? Math.floor(rand() ** 2 * 60) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count, level: 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return withLevels(days);
}

// GitHub-style quartile levels, for data that doesn't already include them.
function withLevels(days) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return days.map((d) => ({ ...d, level: d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4)) }));
}

export function computeStats(days) {
  let total = 0;
  let best = days[0];
  let streak = 0;
  let longest = 0;
  for (const d of days) {
    total += d.count;
    if (d.count > best.count) best = d;
    streak = d.count > 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  return { total, best, longest };
}
