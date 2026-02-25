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
}
