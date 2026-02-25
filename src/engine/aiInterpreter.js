export async function interpretCommandWithAI(userInput, activityList) {
  const actSummary = activityList.map(a =>
    `${a.code}: "${a.name}" (Bldg${a.building}, ${a.wbsName}, dur=${a.duration}d, day${a.calculatedStart||a.startDay})`
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
  function findAct(t) { const u=t.toUpperCase(); for(const a of activityList){if(u.includes(a.code.toUpperCase()))return a;} for(const a of activityList){if(t.toLowerCase().includes(a.name.toLowerCase()))return a;} return null; }
  function findAllCodes(t) { const m=[],u=t.toUpperCase(); for(const a of activityList){if(u.includes(a.code.toUpperCase()))m.push(a);} return m; }
  function extractDays(t) { const w=t.match(/(\d+)\s*week/i); if(w)return parseInt(w[1])*7; const d=t.match(/(\d+)\s*(day|d\b)/i); if(d)return parseInt(d[1]); const b=t.match(/by\s+(\d+)/i); if(b)return parseInt(b[1]); return null; }
  function extractBuilding(t) { const m=t.match(/building\s*(\d)/i)||t.match(/bldg\s*(\d)/i); return m?parseInt(m[1]):null; }

  if(cmd.match(/\b(link|tie|connect)\b/)){const a=findAllCodes(cmd);if(a.length>=2){const t=cmd.includes('start-to-start')||cmd.match(/\bss\b/)?'SS':cmd.includes('finish-to-finish')||cmd.match(/\bff\b/)?'FF':'FS';return{action:'link',pred:a[0].id,succ:a[1].id,type:t,lag:extractDays(cmd)||0};}const b=extractBuilding(cmd);if(cmd.includes('foundation')&&cmd.includes('steel')&&b)return{action:'link_phases',building:b,fromPhase:'Foundation',toPhase:'Steel'};return{action:'clarify',message:'I need two activity IDs to link.'};}
  if(cmd.match(/\b(unlink|remove\s+link|break)\b/)){const a=findAllCodes(cmd);if(a.length>=2)return{action:'unlink',pred:a[0].id,succ:a[1].id};return{action:'clarify',message:'I need two activity IDs.'};}
  if(cmd.match(/\b(push|delay|shift|move|slide|pull)\b/)){const d=extractDays(cmd),dir=cmd.includes('earlier')||cmd.includes('pull')?-1:1,b=extractBuilding(cmd);const phases=['preconstruction','foundation','steel','concrete','mep','finishes','commissioning'];for(const p of phases){if(cmd.includes(p)&&b&&d){const pm={preconstruction:'Preconstruction',foundation:'Foundation',steel:'Structural Steel',concrete:'Concrete',mep:'MEP',finishes:'Finishes',commissioning:'Commissioning'};return{action:'bulk_shift',building:b,phase:pm[p]||p,days:d*dir};}}const a=findAct(cmd);if(a&&d)return{action:'shift',activityId:a.id,days:d*dir};return{action:'clarify',message:'I need an activity and days. Example: "push SS1210 by 5 days"'};}
  if(cmd.match(/\b(duration|extend|shorten)\b/)){const a=findAct(cmd),d=extractDays(cmd);if(a&&d)return{action:'duration',activityId:a.id,newDuration:d};return{action:'clarify',message:'I need an activity and duration.'};}
  if(cmd.match(/\b(mark|complete|status)\b/)){const a=findAct(cmd),s=cmd.includes('complete')?'Completed':cmd.includes('progress')?'In Progress':null;if(a&&s)return{action:'status',activityId:a.id,status:s};return{action:'clarify',message:'Example: "mark SS1210 as completed"'};}
  if(cmd.match(/\b(show|filter|view)\b/)){if(cmd.includes('all'))return{action:'show_all'};const b=extractBuilding(cmd);if(b)return{action:'filter',filter:'building',building:b};const a=findAct(cmd);if(a)return{action:'highlight',activityId:a.id};return{action:'clarify',message:'Try: "show building 1" or "show all"'};}
  return{action:'clarify',message:'Try: "push SS1210 by 5 days", "link FD1140 to SS1200", "show building 1"'};
}
