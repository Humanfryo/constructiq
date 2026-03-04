export class CPMEngine {
  constructor(activities, relationships) {
    this.activities = new Map();
    this.relationships = relationships || [];
    activities.forEach(a => this.activities.set(a.id, { ...a }));
  }

  // ============================================================
  // FORWARD PASS — Early Start / Early Finish
  // ============================================================
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

  // ============================================================
  // BACKWARD PASS — Late Start / Late Finish / Total Float
  // ============================================================
  // Processes activities in reverse topological order.
  // Activities with no successors get lateFinish = project end date.
  // Float = lateStart - earlyStart (zero float = critical).
  // ============================================================
  backwardPass() {
    // 1. Find the project end date (max earlyFinish across all activities)
    let projectEnd = 0;
    this.activities.forEach(act => {
      const ef = act.earlyFinish != null ? act.earlyFinish : (act.startDay + act.duration - 1);
      if (ef > projectEnd) projectEnd = ef;
    });

    // 2. Initialize all activities with lateFinish = projectEnd
    this.activities.forEach(act => {
      act.lateFinish = projectEnd;
      act.lateStart = projectEnd - act.duration + 1;
      act.totalFloat = 0;
      act.isCritical = false;
    });

    // 3. Build a set of activities that have successors
    const hasSuccessor = new Set();
    this.relationships.forEach(r => {
      if (this.activities.has(r.predecessor)) {
        hasSuccessor.add(r.predecessor);
      }
    });

    // 4. Process in reverse topological order
    const order = this.topologicalSort();
    const reverseOrder = [...order].reverse();

    reverseOrder.forEach(id => {
      const act = this.activities.get(id);
      if (!act) return;

      // Find all relationships where this activity is the PREDECESSOR
      const succs = this.relationships.filter(r => r.predecessor === id);

      if (succs.length === 0) {
        // No successors — lateFinish stays at projectEnd
        act.lateFinish = projectEnd;
      } else {
        // Constrain lateFinish based on each successor
        let minLF = projectEnd;

        succs.forEach(r => {
          const succ = this.activities.get(r.successor);
          if (!succ) return;
          const lag = r.lag || 0;

          let constraint;
          switch (r.type) {
            case 'FS':
              // pred must finish before succ starts: LF ≤ succ.LS - 1 - lag
              constraint = succ.lateStart - 1 - lag;
              break;
            case 'SS':
              // pred must start before succ starts: LS ≤ succ.LS - lag
              // → LF ≤ succ.LS - lag + duration - 1
              constraint = succ.lateStart - lag + act.duration - 1;
              break;
            case 'FF':
              // pred must finish before succ finishes: LF ≤ succ.LF - lag
              constraint = succ.lateFinish - lag;
              break;
            case 'SF':
              // pred must start before succ finishes: LS ≤ succ.LF - lag
              // → LF ≤ succ.LF - lag + duration - 1
              constraint = succ.lateFinish - lag + act.duration - 1;
              break;
            default:
              constraint = succ.lateStart - 1 - lag;
          }

          if (constraint < minLF) minLF = constraint;
        });

        act.lateFinish = minLF;
      }

      act.lateStart = act.lateFinish - act.duration + 1;
      act.totalFloat = act.lateStart - act.earlyStart;

      // Critical = zero float (with small epsilon for floating-point safety)
      act.isCritical = Math.abs(act.totalFloat) < 0.001;
    });
  }

  // ============================================================
  // TOPOLOGICAL SORT
  // ============================================================
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

  // ============================================================
  // RECALCULATE — Forward + Backward pass
  // ============================================================
  recalculate() {
    this.forwardPass();
    this.backwardPass();
    return Array.from(this.activities.values());
  }

  // ============================================================
  // CRITICAL PATH QUERIES
  // ============================================================
  getCriticalPath() {
    return Array.from(this.activities.values()).filter(a => a.isCritical);
  }

  isCritical(id) {
    const act = this.activities.get(id);
    return act ? act.isCritical : false;
  }

  getFloat(id) {
    const act = this.activities.get(id);
    return act ? (act.totalFloat || 0) : 0;
  }

  getCriticalPathStats() {
    const all = Array.from(this.activities.values());
    const critical = all.filter(a => a.isCritical);
    const nearCritical = all.filter(a => !a.isCritical && a.totalFloat <= 5);

    // Find project end
    let projectEnd = 0;
    all.forEach(a => {
      const ef = a.earlyFinish || (a.startDay + a.duration - 1);
      if (ef > projectEnd) projectEnd = ef;
    });

    return {
      totalActivities: all.length,
      criticalCount: critical.length,
      nearCriticalCount: nearCritical.length,
      projectDuration: projectEnd,
      criticalActivities: critical,
      nearCriticalActivities: nearCritical,
    };
  }

  // ============================================================
  // EXISTING METHODS (unchanged)
  // ============================================================
  getActivity(id) { return this.activities.get(id); }

  updateActivity(id, changes) {
    const a = this.activities.get(id);
    if (!a) return null;
    Object.assign(a, changes);
    this.recalculate();
    return a;
  }

  addRelationship(pred, succ, type = 'FS', lag = 0) {
    if (!this.activities.has(pred) || !this.activities.has(succ)) return false;
    if (this.relationships.find(r => r.predecessor === pred && r.successor === succ)) return false;
    this.relationships.push({ predecessor: pred, successor: succ, type, lag });
    this.recalculate();
    return true;
  }

  removeRelationship(pred, succ) {
    const i = this.relationships.findIndex(r => r.predecessor === pred && r.successor === succ);
    if (i === -1) return false;
    this.relationships.splice(i, 1);
    this.recalculate();
    return true;
  }

  getDownstream(id) {
    const ds = new Set(); const q = [id];
    while (q.length > 0) {
      const c = q.shift();
      this.relationships.filter(r => r.predecessor === c).forEach(r => {
        if (!ds.has(r.successor)) { ds.add(r.successor); q.push(r.successor); }
      });
    }
    return ds;
  }

  getAllActivitiesList() { return Array.from(this.activities.values()); }

  // ============================================================
  // CREATE ACTIVITY
  // ============================================================
  createActivity({ wbs, wbsName, name, duration, building, predecessorId, startDay }) {
    const code = this._generateCode(wbs, building);

    let effectiveStart = startDay || 0;
    if (predecessorId) {
      const pred = this.activities.get(predecessorId);
      if (pred) {
        effectiveStart = (pred.calculatedStart || pred.startDay) + pred.duration;
      }
    }

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
  // CREATE WBS
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
          predecessorId: def.predecessorId || prevId,
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

  getWBSList() {
    const wbsSet = new Map();
    this.activities.forEach(a => {
      if (!wbsSet.has(a.wbs)) {
        wbsSet.set(a.wbs, { wbs: a.wbs, wbsName: a.wbsName, building: a.building });
      }
    });
    return Array.from(wbsSet.values());
  }

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

  _generateCode(wbs, building) {
    const prefixMap = {
      'precon': 'PC', 'foundation': 'FD', 'steel': 'SS', 'concrete': 'CO',
      'mep': 'ME', 'finishes': 'FN', 'commissioning': 'CX', 'sitework': 'SW',
    };

    const wbsLower = (wbs || '').toLowerCase();
    let prefix = 'GN';
    for (const [key, val] of Object.entries(prefixMap)) {
      if (wbsLower.includes(key)) { prefix = val; break; }
    }

    const pattern = new RegExp(`^${prefix}${building}(\\d+)$`);
    let maxSeq = 0;
    this.activities.forEach((_, id) => {
      const match = id.match(pattern);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });

    const nextSeq = Math.ceil((maxSeq + 1) / 10) * 10;
    const code = `${prefix}${building}${String(nextSeq).padStart(3, '0')}`;

    if (this.activities.has(code)) {
      return `${prefix}${building}${String(nextSeq + 10).padStart(3, '0')}`;
    }

    return code;
  }

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
    const parts = wbs.split('.');
    return parts[parts.length - 1] || 'General';
  }
}
