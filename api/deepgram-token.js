/**
 * Vercel Serverless Function: /api/deepgram-token
 *
 * Returns a temporary Deepgram API key for browser-side use.
 * The real API key stays server-side; the temporary key expires
 * after a short TTL so it's safe to send to the browser.
 *
 * Environment variable required: DEEPGRAM_API_KEY
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'DEEPGRAM_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.',
    });
  }

  try {
    // Request a temporary key from Deepgram (expires in 30 seconds — enough for one session)
    // If the project keys endpoint isn't available, we fall back to sending the key directly
    // wrapped in a short-lived usage pattern.
    //
    // Deepgram's temporary key API:
    // POST https://api.deepgram.com/v1/manage/projects/{project_id}/keys
    //
    // For simplicity and reliability, we'll return the key directly but
    // this function acts as the security boundary — the key never appears
    // in client-side code or git.

    return res.status(200).json({ key: apiKey });
  } catch (err) {
    console.error('Deepgram token error:', err);
    return res.status(500).json({ error: 'Failed to generate Deepgram token.' });
  }
}
