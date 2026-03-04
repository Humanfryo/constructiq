export class CPMEngine {
  constructor(activities, relationships) {
    this.activities = new Map();
    this.relationships = relationships || [];
    activities.forEach(a => this.activities.set(a.id, { ...a }));
  }
  forwardPass() {
    const order = this.topologicalSort();
    order.forEach(id => {
      const act = this.activities.get(id);
      if (!act) return;
      const preds = this.relationships.filter(r => r.successor === id);
      if (preds.length === 0) {
        act.earlyStart = act.startDay;
        act.earlyFinish = act.startDay + act.duration - 1;
      } else {
        let maxES = 0;
        preds.forEach(r => {
          const pred = this.activities.get(r.predecessor);
          if (!pred) return;
          const lag = r.lag || 0;
          switch (r.type) {
            case 'FS': maxES = Math.max(maxES, (pred.earlyFinish || pred.startDay + pred.duration - 1) + 1 + lag); break;
            case 'SS': maxES = Math.max(maxES, (pred.earlyStart || pred.startDay) + lag); break;
            case 'FF': maxES = Math.max(maxES, (pred.earlyFinish || pred.startDay + pred.duration - 1) + 1 + lag - act.duration); break;
            case 'SF': maxES = Math.max(maxES, (pred.earlyStart || pred.startDay) + lag - act.duration); break;
            default: maxES = Math.max(maxES, (pred.earlyFinish || pred.startDay + pred.duration - 1) + 1 + lag);
          }
        });
        act.earlyStart = Math.max(maxES, act.startDay);
        act.earlyFinish = act.earlyStart + act.duration - 1;
      }
      act.calculatedStart = act.earlyStart;
    });
  }
  topologicalSort() {
    const inDeg = new Map(); const adj = new Map();
    this.activities.forEach((_, id) => { inDeg.set(id, 0); adj.set(id, []); });
    this.relationships.forEach(r => {
      if (this.activities.has(r.predecessor) && this.activities.has(r.successor)) {
        adj.get(r.predecessor).push(r.successor);
        inDeg.set(r.successor, (inDeg.get(r.successor) || 0) + 1);
      }
    });
    const queue = []; inDeg.forEach((d, id) => { if (d === 0) queue.push(id); });
    const order = [];
    while (queue.length > 0) {
      const id = queue.shift(); order.push(id);
      (adj.get(id) || []).forEach(s => { inDeg.set(s, inDeg.get(s) - 1); if (inDeg.get(s) === 0) queue.push(s); });
    }
    this.activities.forEach((_, id) => { if (!order.includes(id)) order.push(id); });
    return order;
  }
  recalculate() { this.forwardPass(); return Array.from(this.activities.values()); }
  getActivity(id) { return this.activities.get(id); }
  updateActivity(id, changes) { const a = this.activities.get(id); if (!a) return null; Object.assign(a, changes); this.recalculate(); return a; }
  addRelationship(pred, succ, type = 'FS', lag = 0) {
    if (!this.activities.has(pred) || !this.activities.has(succ)) return false;
    if (this.relationships.find(r => r.predecessor === pred && r.successor === succ)) return false;
    this.relationships.push({ predecessor: pred, successor: succ, type, lag }); this.recalculate(); return true;
  }
  removeRelationship(pred, succ) {
    const i = this.relationships.findIndex(r => r.predecessor === pred && r.successor === succ);
    if (i === -1) return false; this.relationships.splice(i, 1); this.recalculate(); return true;
  }
  getDownstream(id) {
    const ds = new Set(); const q = [id];
    while (q.length > 0) { const c = q.shift(); this.relationships.filter(r => r.predecessor === c).forEach(r => { if (!ds.has(r.successor)) { ds.add(r.successor); q.push(r.successor); } }); }
    return ds;
  }
  getAllActivitiesList() { return Array.from(this.activities.values()); }

  // ============================================================
  // NEW: Create Activity
  // ============================================================
  // Generates a unique activity code and adds the activity to the engine.
  // Returns the new activity object, or null if the WBS is invalid.
  //
  // wbs: full WBS path like "BLDG1.MEP" or "BLDG2.Foundation"
  // name: activity name like "Cable Tray Installation"
  // duration: integer days
  // building: integer 1-4
  // predecessorId: optional — auto-links FS if provided
  // startDay: optional — defaults to project day 0 (will be pushed by CPM if linked)
  // ============================================================
  createActivity({ wbs, wbsName, name, duration, building, predecessorId, startDay }) {
    // Generate a unique code
    const code = this._generateCode(wbs, building);

    // Determine start day: if predecessor given, place after it; otherwise use explicit or 0
    let effectiveStart = startDay || 0;
    if (predecessorId) {
      const pred = this.activities.get(predecessorId);
      if (pred) {
        effectiveStart = (pred.calculatedStart || pred.startDay) + pred.duration;
      }
    }

    // Resolve wbsName from wbs path if not provided
    const resolvedWbsName = wbsName || this._wbsNameFromPath(wbs);

    const activity = {
      id: code,
      code: code,
      name: name,
      wbs: wbs,
      wbsName: resolvedWbsName,
      building: building,
      duration: duration,
      startDay: effectiveStart,
      status: 'Not Started',
      pctComplete: 0,
    };

    this.activities.set(code, activity);

    // Auto-link to predecessor if provided
    if (predecessorId && this.activities.has(predecessorId)) {
      this.relationships.push({
        predecessor: predecessorId,
        successor: code,
        type: 'FS',
        lag: 0,
      });
    }

    this.recalculate();
    return activity;
  }

  // ============================================================
  // NEW: Create WBS (adds a group of placeholder activities)
  // ============================================================
  // Creates a new WBS category under a building and optionally seeds it
  // with initial activities.
  //
  // Returns { wbs, wbsName, activities[] }
  // ============================================================
  createWBS({ building, wbsCode, wbsName, activities: activityDefs }) {
    const wbs = `BLDG${building}.${wbsCode}`;
    const created = [];

    if (activityDefs && activityDefs.length > 0) {
      let prevId = null;
      activityDefs.forEach((def) => {
        const act = this.createActivity({
          wbs,
          wbsName,
          name: def.name,
          duration: def.duration || 5,
          building,
          predecessorId: def.predecessorId || prevId, // auto-chain sequentially
          startDay: def.startDay,
        });
        if (act) {
          created.push(act);
          prevId = act.id;
        }
      });
    }

    return { wbs, wbsName, activities: created };
  }

  // ============================================================
  // NEW: Get all unique WBS paths in the project
  // ============================================================
  getWBSList() {
    const wbsSet = new Map();
    this.activities.forEach(a => {
      if (!wbsSet.has(a.wbs)) {
        wbsSet.set(a.wbs, { wbs: a.wbs, wbsName: a.wbsName, building: a.building });
      }
    });
    return Array.from(wbsSet.values());
  }

  // ============================================================
  // NEW: Find the last activity in a WBS (for appending after it)
  // ============================================================
  getLastActivityInWBS(wbs) {
    let last = null;
    let maxEnd = -1;
    this.activities.forEach(a => {
      if (a.wbs === wbs) {
        const end = (a.calculatedStart || a.startDay) + a.duration;
        if (end > maxEnd) {
          maxEnd = end;
          last = a;
        }
      }
    });
    return last;
  }

  // ── Internal helpers ─────────────────────────────────────────

  // Generate a unique activity code based on WBS phase prefix + building + sequence number
  _generateCode(wbs, building) {
    // Map WBS category to 2-letter prefix
    const prefixMap = {
      'precon': 'PC', 'foundation': 'FD', 'steel': 'SS', 'concrete': 'CO',
      'mep': 'ME', 'finishes': 'FN', 'commissioning': 'CX', 'sitework': 'SW',
    };

    const wbsLower = (wbs || '').toLowerCase();
    let prefix = 'GN'; // Generic fallback
    for (const [key, val] of Object.entries(prefixMap)) {
      if (wbsLower.includes(key)) { prefix = val; break; }
    }

    // Find the highest existing sequence number for this prefix + building
    const pattern = new RegExp(`^${prefix}${building}(\\d+)$`);
    let maxSeq = 0;
    this.activities.forEach((_, id) => {
      const match = id.match(pattern);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });

    // Next sequence: round up to next 10 for cleanliness
    const nextSeq = Math.ceil((maxSeq + 1) / 10) * 10;
    const code = `${prefix}${building}${String(nextSeq).padStart(3, '0')}`;

    // Safety: if somehow this code exists, increment by 10
    if (this.activities.has(code)) {
      return `${prefix}${building}${String(nextSeq + 10).padStart(3, '0')}`;
    }

    return code;
  }

  // Resolve a human-readable WBS name from a WBS path
  _wbsNameFromPath(wbs) {
    const nameMap = {
      'precon': 'Preconstruction', 'foundation': 'Foundation', 'steel': 'Structural Steel',
      'concrete': 'Concrete', 'mep': 'MEP Rough-In', 'finishes': 'Finishes',
      'commissioning': 'Commissioning', 'sitework': 'Sitework',
    };
    const wbsLower = (wbs || '').toLowerCase();
    for (const [key, val] of Object.entries(nameMap)) {
      if (wbsLower.includes(key)) return val;
    }
    // If it's a custom WBS, extract the last segment
    const parts = wbs.split('.');
    return parts[parts.length - 1] || 'General';
  }
}
