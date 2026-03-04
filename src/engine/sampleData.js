export const PROJECT_START = new Date('2026-03-02');
export function dayToDate(day) { const d = new Date(PROJECT_START); d.setDate(d.getDate() + day); return d; }
export function formatDate(day) { return dayToDate(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); }
export const WBS_COLORS = { 'PRECON': '#3B82F6', 'Foundation': '#8B5CF6', 'Steel': '#EF4444', 'MEP': '#10B981', 'Concrete': '#F59E0B', 'Finishes': '#EC4899', 'Commissioning': '#06B6D4', 'Sitework': '#84CC16' };

// Extended color palette for user-created WBS categories
const EXTRA_COLORS = ['#F97316', '#A855F7', '#14B8A6', '#E11D48', '#65A30D', '#0EA5E9', '#D946EF', '#CA8A04', '#DC2626', '#7C3AED', '#059669', '#DB2777'];
const _dynamicColorMap = new Map();
let _colorIndex = 0;

export function getWbsColor(wbs) {
  for (const [k, c] of Object.entries(WBS_COLORS)) {
    if (wbs.toLowerCase().includes(k.toLowerCase())) return c;
  }
  const wbsKey = wbs.toLowerCase();
  if (!_dynamicColorMap.has(wbsKey)) {
    _dynamicColorMap.set(wbsKey, EXTRA_COLORS[_colorIndex % EXTRA_COLORS.length]);
    _colorIndex++;
  }
  return _dynamicColorMap.get(wbsKey);
}

// ============================================================
// TRADE / DIVISION CLASSIFICATION
// ============================================================
// Trades represent the actual work discipline, independent of
// WBS phase. A single WBS phase like "MEP" contains activities
// from Electrical, Plumbing, Mechanical, and Fire Protection.
// ============================================================

export const TRADES = [
  'Electrical',
  'Plumbing',
  'Structural Steel',
  'Concrete',
  'Mechanical/HVAC',
  'Fire Protection',
  'Power Systems',
  'Finishes',
  'Commissioning',
  'General/Site',
];

export const TRADE_COLORS = {
  'Electrical': '#FACC15',  // Yellow
  'Plumbing': '#38BDF8',  // Light blue
  'Structural Steel': '#EF4444',  // Red
  'Concrete': '#F59E0B',  // Amber
  'Mechanical/HVAC': '#22C55E',  // Green
  'Fire Protection': '#F97316',  // Orange
  'Power Systems': '#A855F7',  // Purple
  'Finishes': '#EC4899',  // Pink
  'Commissioning': '#06B6D4',  // Cyan
  'General/Site': '#64748B',  // Slate
};

// Infer trade from activity name (and optionally WBS context)
export function inferTrade(activityName, wbs) {
  const n = (activityName || '').toLowerCase();
  const w = (wbs || '').toLowerCase();

  // Electrical
  if (/electrical|energiz|wiring|panel|switchgear|cable\s*tray|conduit|power\s*dist/i.test(n)) return 'Electrical';

  // Power Systems (generators, UPS, transformers)
  if (/generator|ups\b|uninterrupt|transformer|battery|pdu/i.test(n)) return 'Power Systems';

  // Plumbing
  if (/plumbing|piping|drainage|sanitary|water\s*line|domestic\s*water|storm\s*drain/i.test(n)) return 'Plumbing';

  // Fire Protection
  if (/fire\s*protect|sprinkler|fire\s*alarm|fire\s*suppression|standpipe/i.test(n)) return 'Fire Protection';

  // Mechanical / HVAC
  if (/mechanical|hvac|duct|air\s*handler|chiller|cooling|balancing|ahu|crac|ventilat/i.test(n)) return 'Mechanical/HVAC';

  // Structural Steel
  if (/steel|column|beam|joist|decking|anchor\s*bolt|embed|erect|roof\s*steel/i.test(n)) return 'Structural Steel';

  // Concrete
  if (/concrete|slab|topping|equipment\s*pad|sog|grade\s*beam|foundation\s*wall|pour|formwork|rebar/i.test(n)) return 'Concrete';

  // Finishes
  if (/finish|clad|roofing|framing|drywall|paint|flooring|door|hardware|exterior\s*skin|ceiling|tile/i.test(n)) return 'Finishes';

  // Commissioning (testing, inspections, turnover)
  if (/commission|testing|inspection|turnover|punchlist|acceptance|startup/i.test(n)) return 'Commissioning';

  // General / Site (survey, permits, mobilization, excavation, pile, waterproofing)
  if (/survey|permit|mobil|excav|pile|waterproof|submittal|layout|grading|backfill|dewater/i.test(n)) return 'General/Site';

  // Fallback: try WBS context
  if (w.includes('steel')) return 'Structural Steel';
  if (w.includes('concrete') || w.includes('foundation')) return 'Concrete';
  if (w.includes('mep')) return 'Mechanical/HVAC';
  if (w.includes('finish')) return 'Finishes';
  if (w.includes('commission')) return 'Commissioning';
  if (w.includes('precon') || w.includes('sitework')) return 'General/Site';

  return 'General/Site';
}

export function getTradeColor(trade) {
  return TRADE_COLORS[trade] || '#64748B';
}

export function generateSampleData() {
  const activities = [], relationships = [];
  [1, 2, 3, 4].forEach((bldg, bIdx) => {
    const o = bIdx * 5;
    const phases = [
      {
        wbs: `BLDG${bldg}.PRECON`, name: 'Preconstruction', tasks: [
          { code: `PC${bldg}010`, name: 'Survey & Layout', dur: 5, start: 0 + o }, { code: `PC${bldg}020`, name: 'Permits & Submittals', dur: 10, start: 3 + o }, { code: `PC${bldg}030`, name: 'Mobilization', dur: 3, start: 12 + o }]
      },
      {
        wbs: `BLDG${bldg}.Foundation`, name: 'Foundation', tasks: [
          { code: `FD${bldg}100`, name: 'Excavation', dur: 8, start: 15 + o }, { code: `FD${bldg}110`, name: 'Pile Driving', dur: 12, start: 23 + o }, { code: `FD${bldg}120`, name: 'Grade Beams', dur: 10, start: 35 + o },
          { code: `FD${bldg}130`, name: 'Foundation Walls', dur: 8, start: 45 + o }, { code: `FD${bldg}140`, name: 'SOG Prep & Pour', dur: 6, start: 53 + o }, { code: `FD${bldg}150`, name: 'Waterproofing', dur: 4, start: 59 + o }]
      },
      {
        wbs: `BLDG${bldg}.Steel`, name: 'Structural Steel', tasks: [
          { code: `SS${bldg}200`, name: 'Anchor Bolts & Embeds', dur: 5, start: 58 + o }, { code: `SS${bldg}210`, name: 'Erect Columns Zone 1', dur: 10, start: 63 + o }, { code: `SS${bldg}220`, name: 'Erect Columns Zone 2', dur: 10, start: 68 + o },
          { code: `SS${bldg}230`, name: 'Erect Beams & Joists', dur: 15, start: 73 + o }, { code: `SS${bldg}240`, name: 'Metal Decking', dur: 8, start: 88 + o }, { code: `SS${bldg}250`, name: 'Roof Steel', dur: 10, start: 93 + o }]
      },
      {
        wbs: `BLDG${bldg}.Concrete`, name: 'Concrete', tasks: [
          { code: `CO${bldg}300`, name: 'Elevated Slab on Deck', dur: 12, start: 96 + o }, { code: `CO${bldg}310`, name: 'Topping Slab', dur: 6, start: 108 + o }, { code: `CO${bldg}320`, name: 'Equipment Pads', dur: 5, start: 114 + o }]
      },
      {
        wbs: `BLDG${bldg}.MEP`, name: 'MEP Rough-In', tasks: [
          { code: `ME${bldg}400`, name: 'Underground Electrical', dur: 8, start: 50 + o }, { code: `ME${bldg}410`, name: 'Underground Plumbing', dur: 6, start: 50 + o }, { code: `ME${bldg}420`, name: 'Electrical Rough-In', dur: 20, start: 100 + o },
          { code: `ME${bldg}430`, name: 'Mechanical Rough-In', dur: 18, start: 100 + o }, { code: `ME${bldg}440`, name: 'Fire Protection', dur: 12, start: 110 + o }, { code: `ME${bldg}450`, name: 'Generator Install', dur: 10, start: 120 + o }, { code: `ME${bldg}460`, name: 'UPS Systems', dur: 8, start: 125 + o }]
      },
      {
        wbs: `BLDG${bldg}.Finishes`, name: 'Finishes', tasks: [
          { code: `FN${bldg}500`, name: 'Exterior Skin / Cladding', dur: 25, start: 103 + o }, { code: `FN${bldg}510`, name: 'Roofing', dur: 10, start: 103 + o }, { code: `FN${bldg}520`, name: 'Interior Framing', dur: 15, start: 120 + o },
          { code: `FN${bldg}530`, name: 'Drywall & Paint', dur: 12, start: 135 + o }, { code: `FN${bldg}540`, name: 'Flooring', dur: 8, start: 147 + o }, { code: `FN${bldg}550`, name: 'Doors & Hardware', dur: 5, start: 150 + o }]
      },
      {
        wbs: `BLDG${bldg}.Commissioning`, name: 'Commissioning', tasks: [
          { code: `CX${bldg}600`, name: 'MEP Testing', dur: 10, start: 155 + o }, { code: `CX${bldg}610`, name: 'Electrical Energization', dur: 5, start: 160 + o }, { code: `CX${bldg}620`, name: 'Generator Testing', dur: 5, start: 165 + o },
          { code: `CX${bldg}630`, name: 'UPS Commissioning', dur: 5, start: 168 + o }, { code: `CX${bldg}640`, name: 'HVAC Balancing', dur: 8, start: 170 + o }, { code: `CX${bldg}650`, name: 'Final Inspections', dur: 3, start: 178 + o },
          { code: `CX${bldg}660`, name: `Building ${bldg} Turnover`, dur: 1, start: 181 + o }]
      },
    ];
    phases.forEach(ph => {
      ph.tasks.forEach(t => {
        activities.push({
          id: t.code, code: t.code, name: t.name, wbs: ph.wbs, wbsName: ph.name, building: bldg, duration: t.dur, startDay: t.start,
          trade: inferTrade(t.name, ph.wbs),
          status: t.start < 20 ? 'Completed' : t.start < 60 ? 'In Progress' : 'Not Started', pctComplete: t.start < 20 ? 100 : t.start < 60 ? Math.floor(Math.random() * 60 + 20) : 0
        });
      });
    });
    const r = (p, s, t = 'FS', l = 0) => relationships.push({ predecessor: p, successor: s, type: t, lag: l });
    r(`PC${bldg}010`, `PC${bldg}020`); r(`PC${bldg}020`, `PC${bldg}030`); r(`PC${bldg}030`, `FD${bldg}100`);
    r(`FD${bldg}100`, `FD${bldg}110`); r(`FD${bldg}110`, `FD${bldg}120`); r(`FD${bldg}120`, `FD${bldg}130`);
    r(`FD${bldg}130`, `FD${bldg}140`); r(`FD${bldg}140`, `FD${bldg}150`);
    r(`FD${bldg}140`, `SS${bldg}200`, 'FS', -2); r(`SS${bldg}200`, `SS${bldg}210`);
    r(`SS${bldg}210`, `SS${bldg}220`, 'SS', 5); r(`SS${bldg}210`, `SS${bldg}230`);
    r(`SS${bldg}230`, `SS${bldg}240`); r(`SS${bldg}230`, `SS${bldg}250`, 'SS', 5);
    r(`SS${bldg}240`, `CO${bldg}300`); r(`CO${bldg}300`, `CO${bldg}310`); r(`CO${bldg}310`, `CO${bldg}320`);
    r(`FD${bldg}130`, `ME${bldg}400`, 'SS', 3); r(`FD${bldg}130`, `ME${bldg}410`, 'SS', 3);
    r(`SS${bldg}240`, `ME${bldg}420`, 'FS', 2); r(`SS${bldg}240`, `ME${bldg}430`, 'FS', 2);
    r(`ME${bldg}420`, `ME${bldg}440`, 'SS', 5); r(`ME${bldg}420`, `ME${bldg}450`); r(`ME${bldg}450`, `ME${bldg}460`);
    r(`SS${bldg}250`, `FN${bldg}500`); r(`SS${bldg}250`, `FN${bldg}510`);
    r(`ME${bldg}430`, `FN${bldg}520`); r(`FN${bldg}520`, `FN${bldg}530`); r(`FN${bldg}530`, `FN${bldg}540`); r(`FN${bldg}530`, `FN${bldg}550`, 'SS', 5);
    r(`ME${bldg}460`, `CX${bldg}600`); r(`FN${bldg}540`, `CX${bldg}600`);
    r(`CX${bldg}600`, `CX${bldg}610`); r(`CX${bldg}610`, `CX${bldg}620`); r(`CX${bldg}610`, `CX${bldg}630`, 'SS', 3);
    r(`CX${bldg}620`, `CX${bldg}640`); r(`CX${bldg}640`, `CX${bldg}650`); r(`CX${bldg}650`, `CX${bldg}660`);
  });
  return { activities, relationships };
}
