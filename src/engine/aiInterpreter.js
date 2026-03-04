export async function interpretCommandWithAI(userInput, activityList) {
  const actSummary = activityList.map(a =>
    `${a.code}: "${a.name}" (Bldg${a.building}, ${a.wbsName}, dur=${a.duration}d, day${a.calculatedStart || a.startDay})`
  ).join('\n');
  try {
    const response = await fetch('/api/interpret', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput, actSummary }),
    });
    if (!response.ok) { console.warn('API returned', response.status); return parseCommandLocally(userInput, activityList); }
    return await response.json();
  } catch (err) {
    console.warn('API unreachable, using local parser:', err.message);
    return parseCommandLocally(userInput, activityList);
  }
}

export function parseCommandLocally(input, activityList) {
  const cmd = input.toLowerCase().trim();
  function findAct(t) { const u = t.toUpperCase(); for (const a of activityList) { if (u.includes(a.code.toUpperCase())) return a; } for (const a of activityList) { if (t.toLowerCase().includes(a.name.toLowerCase())) return a; } return null; }
  function findAllCodes(t) { const m = [], u = t.toUpperCase(); for (const a of activityList) { if (u.includes(a.code.toUpperCase())) m.push(a); } return m; }
  function extractDays(t) { const w = t.match(/(\d+)\s*week/i); if (w) return parseInt(w[1]) * 7; const d = t.match(/(\d+)\s*(day|d\b)/i); if (d) return parseInt(d[1]); const b = t.match(/by\s+(\d+)/i); if (b) return parseInt(b[1]); return null; }
  function extractBuilding(t) { const m = t.match(/building\s*(\d)/i) || t.match(/bldg\s*(\d)/i); return m ? parseInt(m[1]) : null; }

  // ── NEW: Detect create intent ───────────────────────────────
  if (cmd.match(/\b(create|add|new|insert|append)\b.*\b(activit|task|item|work)\b/) ||
    cmd.match(/\b(create|add|new)\b.*\b(wbs|work breakdown|phase|scope)\b/) ||
    cmd.match(/\bI need (a |an )?\w+.*(activit|task)/) ||
    cmd.match(/\bput in (a |an )?/) ||
    cmd.match(/\badd\b.*\bto\b.*\b(steel|mep|foundation|concrete|finishes|commissioning|precon)/)) {

    const building = extractBuilding(cmd);
    const duration = extractDays(cmd) || 5;

    // Detect WBS/phase
    const phaseMap = {
      'preconstruction': { code: 'PRECON', name: 'Preconstruction' },
      'precon': { code: 'PRECON', name: 'Preconstruction' },
      'foundation': { code: 'Foundation', name: 'Foundation' },
      'steel': { code: 'Steel', name: 'Structural Steel' },
      'concrete': { code: 'Concrete', name: 'Concrete' },
      'mep': { code: 'MEP', name: 'MEP Rough-In' },
      'electrical': { code: 'MEP', name: 'MEP Rough-In' },
      'plumbing': { code: 'MEP', name: 'MEP Rough-In' },
      'mechanical': { code: 'MEP', name: 'MEP Rough-In' },
      'hvac': { code: 'MEP', name: 'MEP Rough-In' },
      'finishes': { code: 'Finishes', name: 'Finishes' },
      'commissioning': { code: 'Commissioning', name: 'Commissioning' },
    };

    let detectedPhase = null;
    for (const [key, val] of Object.entries(phaseMap)) {
      if (cmd.includes(key)) { detectedPhase = val; break; }
    }

    // Detect if it's a new WBS creation
    if (cmd.match(/\b(new|create)\b.*\b(wbs|phase|scope|work breakdown)\b/)) {
      if (!building) {
        return { action: 'clarify', message: 'Which building should I create this new WBS under? (1, 2, 3, or 4)' };
      }

      // Try to extract the WBS name from the command
      const nameMatch = cmd.match(/(?:called|named)\s+["']?([^"']+?)["']?(?:\s+(?:with|under|in|for)|$)/i) ||
        cmd.match(/(?:wbs|phase|scope)\s+(?:called|named)?\s*["']?([^"']+?)["']?(?:\s+(?:with|under|in|for)|$)/i);

      const wbsName = nameMatch ? nameMatch[1].trim() : null;

      if (!wbsName) {
        return { action: 'clarify', message: 'What should I name this new WBS? For example: "Create a new WBS called Site Utilities in Building 1"' };
      }

      const wbsCode = wbsName.replace(/\s+/g, '');
      return {
        action: 'create_wbs',
        building,
        wbsCode,
        wbsName,
        activities: [],
      };
    }

    // Single activity creation
    if (!building) {
      return { action: 'clarify', message: 'Which building? Example: "Add a 10-day Cable Tray Installation to Building 1 MEP"' };
    }

    if (!detectedPhase) {
      return { action: 'clarify', message: 'Which phase/WBS? Example: "Add activity to MEP in Building 1" — options: PRECON, Foundation, Steel, Concrete, MEP, Finishes, Commissioning' };
    }

    // Extract activity name — look for quoted text or "called/named X"
    let actName = null;
    const quotedMatch = cmd.match(/["']([^"']+)["']/);
    const calledMatch = cmd.match(/(?:called|named)\s+["']?([^"',]+)/i);
    const taskMatch = cmd.match(/(?:activity|task)\s+(?:called|named)?\s*["']?([^"',]+?)["']?\s+(?:to|in|under|for|with|at|\d)/i);

    if (quotedMatch) actName = quotedMatch[1].trim();
    else if (calledMatch) actName = calledMatch[1].trim();
    else if (taskMatch) actName = taskMatch[1].trim();

    if (!actName) {
      return { action: 'clarify', message: `What should I name this activity? Example: "Add a 10-day activity called Cable Tray Installation to Building ${building} ${detectedPhase.name}"` };
    }

    // Check if user wants to append after a specific activity
    const afterMatch = cmd.match(/after\s+([A-Z]{2}\d{4})/i);
    const predecessorCode = afterMatch ? afterMatch[1].toUpperCase() : null;
    const afterLast = cmd.includes('end of') || cmd.includes('append') || !predecessorCode;

    return {
      action: 'create_activity',
      name: actName,
      duration,
      building,
      wbs: `BLDG${building}.${detectedPhase.code}`,
      predecessorCode: predecessorCode || undefined,
      afterLast: afterLast && !predecessorCode,
    };
  }

  // ── Existing command parsing (unchanged) ────────────────────

  if (cmd.match(/\b(link|tie|connect)\b/)) { const a = findAllCodes(cmd); if (a.length >= 2) { const t = cmd.includes('start-to-start') || cmd.match(/\bss\b/) ? 'SS' : cmd.includes('finish-to-finish') || cmd.match(/\bff\b/) ? 'FF' : 'FS'; return { action: 'link', pred: a[0].id, succ: a[1].id, type: t, lag: extractDays(cmd) || 0 }; } const b = extractBuilding(cmd); if (cmd.includes('foundation') && cmd.includes('steel') && b) return { action: 'link_phases', building: b, fromPhase: 'Foundation', toPhase: 'Steel' }; return { action: 'clarify', message: 'I need two activity IDs to link.' }; }
  if (cmd.match(/\b(unlink|remove\s+link|break)\b/)) { const a = findAllCodes(cmd); if (a.length >= 2) return { action: 'unlink', pred: a[0].id, succ: a[1].id }; return { action: 'clarify', message: 'I need two activity IDs.' }; }
  if (cmd.match(/\b(push|delay|shift|move|slide|pull)\b/)) { const d = extractDays(cmd), dir = cmd.includes('earlier') || cmd.includes('pull') ? -1 : 1, b = extractBuilding(cmd); const phases = ['preconstruction', 'foundation', 'steel', 'concrete', 'mep', 'finishes', 'commissioning']; for (const p of phases) { if (cmd.includes(p) && b && d) { const pm = { preconstruction: 'Preconstruction', foundation: 'Foundation', steel: 'Structural Steel', concrete: 'Concrete', mep: 'MEP', finishes: 'Finishes', commissioning: 'Commissioning' }; return { action: 'bulk_shift', building: b, phase: pm[p] || p, days: d * dir }; } } const a = findAct(cmd); if (a && d) return { action: 'shift', activityId: a.id, days: d * dir }; return { action: 'clarify', message: 'I need an activity and days. Example: "push SS1210 by 5 days"' }; }
  if (cmd.match(/\b(duration|extend|shorten)\b/)) { const a = findAct(cmd), d = extractDays(cmd); if (a && d) return { action: 'duration', activityId: a.id, newDuration: d }; return { action: 'clarify', message: 'I need an activity and duration.' }; }
  if (cmd.match(/\b(mark|complete|status)\b/)) { const a = findAct(cmd), s = cmd.includes('complete') ? 'Completed' : cmd.includes('progress') ? 'In Progress' : null; if (a && s) return { action: 'status', activityId: a.id, status: s }; return { action: 'clarify', message: 'Example: "mark SS1210 as completed"' }; }
  if (cmd.match(/\b(show|filter|view)\b/)) { if (cmd.includes('all')) return { action: 'show_all' }; const b = extractBuilding(cmd); if (b) return { action: 'filter', filter: 'building', building: b }; const a = findAct(cmd); if (a) return { action: 'highlight', activityId: a.id }; return { action: 'clarify', message: 'Try: "show building 1" or "show all"' }; }
  return { action: 'clarify', message: 'Try: "push SS1210 by 5 days", "link FD1140 to SS1200", "show building 1", "create a new activity called Site Inspection in Building 1 MEP"' };
}
