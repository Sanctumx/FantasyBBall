// Shared by the ESPN collectors (#136): GET a JSON url, retrying 429, 403, 5xx and network errors with doubling waits.
// Other statuses (404, ...) fail at once. No cookies are sent.
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const retryable = s => s === 429 || s === 403 || s >= 500;

export async function fetchJsonRetry(url, { fetchImpl = fetch, sleep = sleepMs, retries = 3, baseMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let err;
    try {
      const r = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'courtside-stats-collector' } });
      if (r.ok) return await r.json();
      err = new Error('ESPN answered HTTP ' + r.status);
      err.final = !retryable(r.status);
    } catch (e) { err = e; }
    if (err.final || attempt >= retries) throw err;
    await sleep(baseMs * 2 ** attempt);
  }
}
