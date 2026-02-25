/**
 * Vercel Serverless Function: /api/interpret
 * 
 * Receives natural language + activity context from the frontend,
 * calls the Anthropic API with the secret key (server-side only),
 * and returns a structured action object.
 * 
 * Environment variable required: ANTHROPIC_API_KEY
 */

export default async function handler(req, res) {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      action: 'clarify',
      message: 'AI service not configured. Using local parser instead.',
    });
  }

  const { userInput, actSummary } = req.body;

  if (!userInput) {
    return res.status(400).json({ action: 'clarify', message: 'No command provided.' });
  }

  const systemPrompt = `You are a construction schedule command interpreter for the HB1-4 Data Centers project. The project has 4 buildings, each with phases: PRECON, Foundation, Steel, Concrete, MEP, Finishes, Commissioning.

Activity codes follow patterns: PC=Preconstruction, FD=Foundation, SS=Steel, CO=Concrete, ME=MEP, FN=Finishes, CX=Commissioning. The digit after letters is the building number (1-4).

Given a natural language command, output ONLY a JSON object (no markdown, no explanation) with one of these structures:

1. Shift activity: {"action":"shift","activityId":"SS1210","days":10}
   - Positive days = push forward/later, negative = pull back/earlier
   - "push back by 2 weeks" = days: 14
   - "move earlier by 5 days" = days: -5

2. Change duration: {"action":"duration","activityId":"CO1300","newDuration":15}

3. Link activities: {"action":"link","pred":"FD1140","succ":"SS1200","type":"FS","lag":0}
   - type can be FS, SS, FF, SF. Default FS.

4. Unlink: {"action":"unlink","pred":"FD1140","succ":"SS1200"}

5. Change status: {"action":"status","activityId":"FD1100","status":"Completed"}
   - status: "Completed", "In Progress", "Not Started"

6. Filter view: {"action":"filter","filter":"building","building":2}

7. Highlight: {"action":"highlight","activityId":"SS1210"}

8. Show all: {"action":"show_all"}

9. Bulk shift phase: {"action":"bulk_shift","building":1,"phase":"Steel","days":14}

10. Bulk link phases: {"action":"link_phases","building":1,"fromPhase":"Foundation","toPhase":"Steel"}

11. If unclear: {"action":"clarify","message":"your clarification question"}

IMPORTANT RULES:
- "push back" or "delay" = POSITIVE days (later)
- "pull in" or "move earlier" = NEGATIVE days
- "2 weeks" = 14 days, "1 week" = 7 days, "a month" = 30 days
- Match activity names fuzzily — "steel erection" matches "Erect Columns Zone 1"
- If user says a phase name without specifying building, ask for clarification

Here are all activities:
${actSummary}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{ role: 'user', content: userInput }],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(200).json({
        action: 'clarify',
        message: 'AI service temporarily unavailable. Try a simpler command.',
      });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Interpret error:', err);
    return res.status(200).json({
      action: 'clarify',
      message: 'Could not interpret that command. Try rephrasing.',
    });
  }
}
