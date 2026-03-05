import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CPMEngine } from "./engine/CPMEngine.js";
import { generateSampleData, PROJECT_START, formatDate, getWbsColor, getTradeColor, inferTrade, TRADES, TRADE_COLORS } from "./engine/sampleData.js";
import { exportToP6Excel } from "./engine/p6Export.js";
import { interpretCommandWithAI } from "./engine/aiInterpreter.js";
import { useVoiceInput } from "./hooks/useVoiceInput.js";

// Data utilities imported from ./engine/sampleData.js

// AI interpreter imported from ./engine/aiInterpreter.js

// Voice hook imported from ./hooks/useVoiceInput.js

// ============================================================
// GANTT CHART COMPONENT
// ============================================================
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 50;
const LEFT_PANEL_WIDTH = 400;

function GanttChart({ activities, relationships, engine, highlighted, animating, filterBuilding, colorByTrade, filterTrade, showCriticalPath, onActivityClick }) {
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [dayWidth, setDayWidth] = useState(4);

  const sorted = useMemo(() => {
    return [...activities].sort((a, b) => {
      if (a.building !== b.building) return a.building - b.building;
      const wo = ['PRECON', 'Foundation', 'Steel', 'Concrete', 'MEP', 'Finishes', 'Commissioning'];
      const ai = wo.findIndex(w => a.wbs.includes(w));
      const bi = wo.findIndex(w => b.wbs.includes(w));
      // Custom WBS categories (not in the standard list) sort to the end
      const aIdx = ai >= 0 ? ai : 999;
      const bIdx = bi >= 0 ? bi : 999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      // Within same WBS, sort by custom WBS name alphabetically, then by start day
      if (ai < 0 && bi < 0 && a.wbs !== b.wbs) return a.wbs.localeCompare(b.wbs);
      return (a.calculatedStart || a.startDay) - (b.calculatedStart || b.startDay);
    });
  }, [activities]);

  const filtered = useMemo(() => {
    let result = sorted;
    if (filterBuilding) result = result.filter(a => a.building === filterBuilding);
    if (filterTrade) result = result.filter(a => a.trade === filterTrade);
    return result;
  }, [sorted, filterBuilding, filterTrade]);

  const totalDays = useMemo(() => {
    let max = 0;
    filtered.forEach(a => { const e = (a.calculatedStart || a.startDay) + a.duration; if (e > max) max = e; });
    return max + 30;
  }, [filtered]);

  const chartHeight = useMemo(() => {
    let rows = 0;
    filtered.forEach((a, i) => {
      const showH = i === 0 || filtered[i - 1].building !== a.building || filtered[i - 1].wbsName !== a.wbsName;
      rows += showH ? 2 : 1;
    });
    return rows * ROW_HEIGHT;
  }, [filtered]);

  const months = useMemo(() => {
    const r = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(PROJECT_START); d.setDate(d.getDate() + i);
      if (i === 0 || d.getDate() === 1) r.push({ day: i, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
    }
    return r;
  }, [totalDays]);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setDayWidth(p => Math.max(1.5, Math.min(20, p + (e.deltaY > 0 ? -0.5 : 0.5))));
    } else {
      setScrollX(p => Math.max(0, p + e.deltaX));
      setScrollY(p => Math.max(0, Math.min(chartHeight - 300, p + e.deltaY)));
    }
  }, [chartHeight]);

  // Pre-compute row positions
  const rowPositions = useMemo(() => {
    const pos = new Map();
    let row = 0;
    filtered.forEach((a, i) => {
      const showH = i === 0 || filtered[i - 1].building !== a.building || filtered[i - 1].wbsName !== a.wbsName;
      row += showH ? 2 : 1;
      pos.set(a.id, row);
    });
    return pos;
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }} onWheel={handleWheel}>
      {/* LEFT PANEL */}
      <div style={{ width: LEFT_PANEL_WIDTH, flexShrink: 0, borderRight: '2px solid #1e293b', overflow: 'hidden', background: '#0a0f1a' }}>
        <div style={{ height: HEADER_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '2px solid #1e293b', background: '#0f172a', gap: 8 }}>
          <span style={{ width: 75, fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1.2, fontFamily: "'JetBrains Mono', monospace" }}>ID</span>
          <span style={{ flex: 1, fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1.2 }}>ACTIVITY NAME</span>
          <span style={{ width: 35, fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1.2, textAlign: 'right' }}>DUR</span>
        </div>
        <div style={{ transform: `translateY(${-scrollY}px)` }}>
          {filtered.map((act, idx) => {
            const isHL = highlighted.has(act.id);
            const isAnim = animating.has(act.id);
            const showH = idx === 0 || filtered[idx - 1].building !== act.building || filtered[idx - 1].wbsName !== act.wbsName;
            return (
              <div key={act.id}>
                {showH && (
                  <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 12px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ width: 4, height: 14, borderRadius: 2, background: colorByTrade ? getTradeColor(act.trade) : getWbsColor(act.wbs), marginRight: 8 }} />
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 0.8 }}>BLDG {act.building} — {act.wbsName.toUpperCase()}</span>
                  </div>
                )}
                <div onClick={() => onActivityClick(act)} style={{
                  height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 12px',
                  borderBottom: '1px solid #111827', cursor: 'pointer',
                  background: isHL ? 'rgba(59,130,246,0.1)' : isAnim ? 'rgba(251,191,36,0.06)' : 'transparent',
                  transition: 'background 0.3s',
                }}>
                  <span style={{ width: 75, fontSize: 11, color: isHL ? '#60a5fa' : '#64748b', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{act.code}</span>
                  <span style={{ flex: 1, fontSize: 12, color: isHL ? '#e2e8f0' : '#94a3b8', fontWeight: isHL ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.name}</span>
                  <span style={{ width: 35, fontSize: 10, color: '#475569', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{act.duration}d</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL — Gantt Bars */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#080d19' }}>
        <div style={{ height: HEADER_HEIGHT, borderBottom: '2px solid #1e293b', background: '#0f172a', overflow: 'hidden' }}>
          <div style={{ transform: `translateX(${-scrollX}px)`, height: '100%', position: 'relative' }}>
            {months.map((m, i) => (
              <div key={i} style={{ position: 'absolute', left: m.day * dayWidth, height: '100%', display: 'flex', alignItems: 'center', padding: '0 6px', borderLeft: '1px solid #1e293b' }}>
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, letterSpacing: 0.5 }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', height: 'calc(100% - 50px)' }}>
          <div style={{ transform: `translate(${-scrollX}px, ${-scrollY}px)`, position: 'relative' }}>
            {/* Grid */}
            {Array.from({ length: Math.floor(totalDays / 7) }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: i * 7 * dayWidth, top: 0, width: 1, height: chartHeight + 400, background: '#111827' }} />
            ))}
            {/* Today */}
            {(() => {
              const td = Math.round((new Date() - PROJECT_START) / 864e5);
              return td >= 0 && td < totalDays ? (
                <div style={{ position: 'absolute', left: td * dayWidth, top: 0, width: 2, height: chartHeight + 400, background: '#ef4444', zIndex: 5, opacity: 0.7 }}>
                  <div style={{ position: 'absolute', top: 0, left: -16, background: '#ef4444', color: '#fff', fontSize: 8, padding: '1px 4px', borderRadius: 2, fontWeight: 800, letterSpacing: 0.5 }}>TODAY</div>
                </div>
              ) : null;
            })()}
            {/* Dependency arrows */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: totalDays * dayWidth, height: chartHeight + 400, pointerEvents: 'none', zIndex: 2 }}>
              {relationships.map((rel, i) => {
                const pRow = rowPositions.get(rel.predecessor);
                const sRow = rowPositions.get(rel.successor);
                if (!pRow || !sRow) return null;
                const pred = filtered.find(a => a.id === rel.predecessor);
                const succ = filtered.find(a => a.id === rel.successor);
                if (!pred || !succ) return null;
                const pS = (pred.calculatedStart || pred.startDay) * dayWidth;
                const pE = pS + pred.duration * dayWidth;
                const sS = (succ.calculatedStart || succ.startDay) * dayWidth;
                const pY = (pRow - 0.5) * ROW_HEIGHT;
                const sY = (sRow - 0.5) * ROW_HEIGHT;
                const x1 = rel.type === 'SS' || rel.type === 'SF' ? pS : pE;
                const x2 = rel.type === 'FF' || rel.type === 'SF' ? sS + succ.duration * dayWidth : sS;
                const isHL = highlighted.has(pred.id) || highlighted.has(succ.id);
                return (
                  <g key={i} opacity={isHL ? 0.7 : 0.15}>
                    <path d={`M ${x1} ${pY} L ${x1 + 8} ${pY} L ${x1 + 8} ${sY} L ${x2} ${sY}`} fill="none" stroke={isHL ? '#60a5fa' : '#475569'} strokeWidth={isHL ? 1.5 : 0.7} />
                    <polygon points={`${x2},${sY} ${x2 - 4},${sY - 3} ${x2 - 4},${sY + 3}`} fill={isHL ? '#60a5fa' : '#475569'} />
                  </g>
                );
              })}
            </svg>
            {/* Bars */}
            {filtered.map((act) => {
              const row = rowPositions.get(act.id);
              if (!row) return null;
              const s = (act.calculatedStart || act.startDay);
              const x = s * dayWidth;
              const w = Math.max(act.duration * dayWidth, 3);
              const y = (row - 1) * ROW_HEIGHT + 7;
              const h = ROW_HEIGHT - 14;
              const color = colorByTrade ? getTradeColor(act.trade) : getWbsColor(act.wbs);
              const isHL = highlighted.has(act.id);
              const isAnim = animating.has(act.id);
              return (
                <div key={act.id} onClick={() => onActivityClick(act)} style={{
                  position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 3,
                  background: act.status === 'Completed' ? `${color}44` : (showCriticalPath && act.isCritical) ? '#ef4444' : color,
                  border: isHL ? '2px solid #fff' : isAnim ? '2px solid #fbbf24' : (showCriticalPath && act.isCritical) ? '1px solid #fca5a5' : `1px solid ${color}66`,
                  cursor: 'pointer',
                  transition: 'left 0.8s cubic-bezier(0.34,1.56,0.64,1), width 0.8s ease, background 0.3s, box-shadow 0.3s',
                  zIndex: isHL ? 10 : 3,
                  boxShadow: isHL ? `0 0 16px ${color}55` : isAnim ? '0 0 20px rgba(251,191,36,0.3)' : (showCriticalPath && act.isCritical) ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
                  display: 'flex', alignItems: 'center', overflow: 'hidden',
                }}>
                  {act.pctComplete > 0 && act.pctComplete < 100 && (
                    <div style={{ position: 'absolute', left: 0, top: 0, width: `${act.pctComplete}%`, height: '100%', background: 'rgba(255,255,255,0.15)', borderRadius: '3px 0 0 3px' }} />
                  )}
                  {w > 45 && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative', zIndex: 1, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{act.code}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MIC BUTTON COMPONENT — Animated
// ============================================================
function MicButton({ isListening, isSupported, onClick, isProcessing, micBlocked }) {
  if (!isSupported) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onClick} style={{
        width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: micBlocked ? 'not-allowed' : 'pointer',
        background: micBlocked ? '#374151' : isListening ? '#ef4444' : isProcessing ? '#f59e0b' : '#3b82f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: isListening ? '0 0 0 4px rgba(239,68,68,0.3), 0 0 20px rgba(239,68,68,0.2)' : isProcessing ? '0 0 0 4px rgba(245,158,11,0.3)' : micBlocked ? 'none' : '0 0 0 2px rgba(59,130,246,0.2)',
        transition: 'all 0.3s ease',
        animation: isListening ? 'pulse-mic 1.5s ease-in-out infinite' : 'none',
        flexShrink: 0, opacity: micBlocked ? 0.5 : 1,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {micBlocked ? (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" opacity="0.4" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" opacity="0.4" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth="2.5" />
            </>
          ) : isListening ? (
            <rect x="6" y="6" width="12" height="12" rx="2" fill="white" stroke="none" />
          ) : isProcessing ? (
            <circle cx="12" cy="12" r="3" fill="white" stroke="none">
              <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite" />
            </circle>
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      </button>
      {micBlocked && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          <div style={{
            background: '#1e293b', color: '#f87171', fontSize: 10, fontWeight: 600,
            padding: '4px 8px', borderRadius: 4, border: '1px solid #374151',
          }}>Mic blocked in iframe</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// WAVEFORM VISUALIZER
// ============================================================
function WaveformVisualizer({ isActive }) {
  if (!isActive) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24, padding: '0 8px' }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, background: '#ef4444',
          animation: `wave-bar 0.8s ease-in-out ${i * 0.07}s infinite alternate`,
        }} />
      ))}
      <style>{`
        @keyframes wave-bar {
          from { height: 4px; opacity: 0.4; }
          to { height: ${12 + Math.random() * 12}px; opacity: 1; }
        }
        @keyframes pulse-mic {
          0%, 100% { box-shadow: 0 0 0 4px rgba(239,68,68,0.3), 0 0 20px rgba(239,68,68,0.2); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0.15), 0 0 30px rgba(239,68,68,0.3); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const { activities: initActs, relationships: initRels } = useMemo(() => generateSampleData(), []);
  const [engine] = useState(() => { const e = new CPMEngine(initActs, initRels); e.recalculate(); return e; });
  const [activities, setActivities] = useState(() => engine.recalculate());
  const [relationships, setRelationships] = useState(initRels);
  const [command, setCommand] = useState('');
  const [commandLog, setCommandLog] = useState([]);
  const [highlighted, setHighlighted] = useState(new Set());
  const [animating, setAnimating] = useState(new Set());
  const [filterBuilding, setFilterBuilding] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [colorByTrade, setColorByTrade] = useState(false);
  const [filterTrade, setFilterTrade] = useState(null);
  const inputRef = useRef(null);

  const voice = useVoiceInput();

  const addLog = useCallback((text, type = 'info') => {
    setCommandLog(prev => [...prev.slice(-30), { text, type, ts: Date.now() }]);
  }, []);

  const handleExport = useCallback(() => {
    try {
      const result = exportToP6Excel(engine);
      addLog(`✓ Exported ${result.activityCount} activities, ${result.relationshipCount} relationships, ${result.wbsCount} WBS elements → ${result.filename}`, 'success');
    } catch (err) {
      addLog(`✗ Export failed: ${err.message}`, 'error');
    }
  }, [engine, addLog]);

  const refresh = useCallback(() => {
    setActivities([...engine.recalculate()]);
    setRelationships([...engine.relationships]);
  }, [engine]);

  const highlightDownstream = useCallback((id) => {
    const ds = engine.getDownstream(id);
    ds.add(id);
    setHighlighted(ds);
    setAnimating(ds);
    setTimeout(() => setAnimating(new Set()), 2500);
  }, [engine]);

  // Execute a parsed action object
  const executeAction = useCallback((parsed) => {
    switch (parsed.action) {
      case 'shift': {
        const act = engine.getActivity(parsed.activityId);
        if (act) {
          engine.updateActivity(parsed.activityId, { startDay: act.startDay + parsed.days });
          refresh();
          highlightDownstream(parsed.activityId);
          addLog(`✓ Shifted ${parsed.activityId} by ${parsed.days > 0 ? '+' : ''}${parsed.days} days → ${engine.getDownstream(parsed.activityId).size} downstream recalculated`, 'success');
        } else {
          addLog(`✗ Activity ${parsed.activityId} not found`, 'error');
        }
        break;
      }
      case 'duration': {
        const act = engine.getActivity(parsed.activityId);
        if (act) {
          const old = act.duration;
          engine.updateActivity(parsed.activityId, { duration: parsed.newDuration });
          refresh();
          highlightDownstream(parsed.activityId);
          addLog(`✓ Duration of ${parsed.activityId}: ${old}d → ${parsed.newDuration}d`, 'success');
        } else {
          addLog(`✗ Activity ${parsed.activityId} not found`, 'error');
        }
        break;
      }
      case 'link': {
        const ok = engine.addRelationship(parsed.pred, parsed.succ, parsed.type || 'FS', parsed.lag || 0);
        if (ok) {
          refresh();
          highlightDownstream(parsed.succ);
          addLog(`✓ Linked ${parsed.pred} → ${parsed.succ} (${parsed.type || 'FS'}${parsed.lag ? `, lag ${parsed.lag}d` : ''})`, 'success');
        } else {
          addLog(`✗ Could not link — activities not found or link exists`, 'error');
        }
        break;
      }
      case 'unlink': {
        const ok = engine.removeRelationship(parsed.pred, parsed.succ);
        if (ok) { refresh(); addLog(`✓ Removed link ${parsed.pred} → ${parsed.succ}`, 'success'); }
        else { addLog(`✗ Link not found`, 'error'); }
        break;
      }
      case 'status': {
        engine.updateActivity(parsed.activityId, {
          status: parsed.status,
          pctComplete: parsed.status === 'Completed' ? 100 : parsed.status === 'In Progress' ? 50 : 0,
        });
        refresh();
        addLog(`✓ ${parsed.activityId} → ${parsed.status}`, 'success');
        break;
      }
      case 'filter': {
        setFilterBuilding(parsed.building || null);
        setHighlighted(new Set());
        addLog(`Filtering to Building ${parsed.building}`, 'info');
        break;
      }
      case 'show_all': {
        setFilterBuilding(null);
        setHighlighted(new Set());
        addLog('Showing all buildings', 'info');
        break;
      }
      case 'highlight': {
        highlightDownstream(parsed.activityId);
        addLog(`Highlighting ${parsed.activityId} + ${engine.getDownstream(parsed.activityId).size} downstream`, 'info');
        break;
      }
      case 'bulk_shift': {
        const acts = engine.getAllActivitiesList().filter(a =>
          a.building === parsed.building && a.wbsName.toLowerCase().includes((parsed.phase || '').toLowerCase())
        );
        if (acts.length === 0) {
          addLog(`✗ No activities found for ${parsed.phase} in Building ${parsed.building}`, 'error');
          break;
        }
        acts.forEach(a => engine.updateActivity(a.id, { startDay: a.startDay + parsed.days }));
        refresh();
        const hl = new Set(acts.map(a => a.id));
        acts.forEach(a => engine.getDownstream(a.id).forEach(d => hl.add(d)));
        setHighlighted(hl);
        setAnimating(hl);
        setTimeout(() => setAnimating(new Set()), 2500);
        addLog(`✓ Shifted ${acts.length} ${parsed.phase} activities in Bldg ${parsed.building} by ${parsed.days > 0 ? '+' : ''}${parsed.days}d`, 'success');
        break;
      }
      case 'link_phases': {
        const fromActs = engine.getAllActivitiesList().filter(a =>
          a.building === parsed.building && a.wbsName.toLowerCase().includes((parsed.fromPhase || '').toLowerCase())
        );
        const toActs = engine.getAllActivitiesList().filter(a =>
          a.building === parsed.building && a.wbsName.toLowerCase().includes((parsed.toPhase || '').toLowerCase())
        );
        if (fromActs.length && toActs.length) {
          const last = fromActs[fromActs.length - 1];
          const first = toActs[0];
          engine.addRelationship(last.id, first.id, 'FS', 0);
          refresh();
          highlightDownstream(first.id);
          addLog(`✓ Linked ${parsed.fromPhase} → ${parsed.toPhase} for Bldg ${parsed.building} (${last.code} → ${first.code})`, 'success');
        } else {
          addLog(`✗ Could not find phases to link`, 'error');
        }
        break;
      }

      // ============================================================
      // NEW: Create a single activity
      // ============================================================
      case 'create_activity': {
        const building = parsed.building;
        const wbs = parsed.wbs || `BLDG${building}.General`;
        const duration = parsed.duration || 5;
        const name = parsed.name;

        if (!building || !name) {
          addLog(`✗ Need a building number and activity name to create an activity`, 'error');
          break;
        }

        // Resolve predecessor: explicit code, or afterLast (append to end of WBS)
        let predecessorId = null;
        if (parsed.predecessorCode) {
          const predAct = engine.getActivity(parsed.predecessorCode);
          if (predAct) {
            predecessorId = predAct.id;
          } else {
            addLog(`⚠ Predecessor ${parsed.predecessorCode} not found — creating without link`, 'warning');
          }
        } else if (parsed.afterLast) {
          const lastAct = engine.getLastActivityInWBS(wbs);
          if (lastAct) {
            predecessorId = lastAct.id;
          }
        }

        const newAct = engine.createActivity({
          wbs,
          name,
          duration,
          building,
          predecessorId,
        });

        if (newAct) {
          newAct.trade = inferTrade(name, wbs);
          refresh();
          const hl = new Set([newAct.id]);
          setHighlighted(hl);
          setAnimating(hl);
          setTimeout(() => setAnimating(new Set()), 3000);

          const startDate = formatDate(newAct.calculatedStart || newAct.startDay);
          const predInfo = predecessorId ? ` (linked after ${predecessorId})` : '';
          addLog(`✓ Created ${newAct.code}: "${newAct.name}" — ${duration}d, ${newAct.wbsName}, Bldg ${building}, starts ${startDate}${predInfo}`, 'success');
        } else {
          addLog(`✗ Failed to create activity`, 'error');
        }
        break;
      }

      // ============================================================
      // NEW: Create a new WBS with activities
      // ============================================================
      case 'create_wbs': {
        const building = parsed.building;
        const wbsCode = parsed.wbsCode;
        const wbsName = parsed.wbsName;

        if (!building || !wbsCode || !wbsName) {
          addLog(`✗ Need building, WBS code, and WBS name. Example: "Create a new WBS called Site Utilities in Building 1"`, 'error');
          break;
        }

        const activityDefs = parsed.activities || [];
        const result = engine.createWBS({
          building,
          wbsCode,
          wbsName,
          activities: activityDefs,
        });

        result.activities.forEach(a => { a.trade = inferTrade(a.name, result.wbs); });
        refresh();

        const hl = new Set(result.activities.map(a => a.id));
        setHighlighted(hl);
        setAnimating(hl);
        setTimeout(() => setAnimating(new Set()), 3000);

        if (result.activities.length > 0) {
          const actNames = result.activities.map(a => `${a.code} (${a.name}, ${a.duration}d)`).join(', ');
          addLog(`✓ Created WBS "${wbsName}" in Bldg ${building} with ${result.activities.length} activities: ${actNames}`, 'success');
        } else {
          addLog(`✓ Created WBS "${wbsName}" (${result.wbs}) in Bldg ${building} — empty, ready for activities`, 'success');
        }

        // Filter to that building so user can see the new WBS
        setFilterBuilding(building);
        break;
      }

      // ============================================================
      // NEW: Create multiple activities in an existing WBS
      // ============================================================
      case 'create_activities': {
        const building = parsed.building;
        const wbs = parsed.wbs || `BLDG${building}.General`;
        const activityDefs = parsed.activities || [];

        if (!building || activityDefs.length === 0) {
          addLog(`✗ Need a building and at least one activity definition`, 'error');
          break;
        }

        // Find the last activity in the target WBS to chain after
        let prevId = null;
        const lastExisting = engine.getLastActivityInWBS(wbs);
        if (lastExisting) prevId = lastExisting.id;

        const created = [];
        activityDefs.forEach((def) => {
          // If this def has a specific predecessor, use it; otherwise chain sequentially
          let predId = prevId;
          if (def.predecessorCode) {
            const predAct = engine.getActivity(def.predecessorCode);
            if (predAct) predId = predAct.id;
          }

          const act = engine.createActivity({
            wbs,
            name: def.name,
            duration: def.duration || 5,
            building,
            predecessorId: predId,
          });

          if (act) {
            act.trade = inferTrade(def.name, wbs);
            created.push(act);
            prevId = act.id;
          }
        });

        refresh();

        const hl = new Set(created.map(a => a.id));
        setHighlighted(hl);
        setAnimating(hl);
        setTimeout(() => setAnimating(new Set()), 3000);

        const actNames = created.map(a => `${a.code} (${a.name}, ${a.duration}d)`).join(', ');
        addLog(`✓ Created ${created.length} activities in Bldg ${building}: ${actNames}`, 'success');

        setFilterBuilding(building);
        break;
      }

      case 'filter_trade': {
        const trade = parsed.trade;
        if (trade) {
          setColorByTrade(true);
          setFilterTrade(trade);
          setFilterBuilding(null);
          const count = engine.getAllActivitiesList().filter(a => a.trade === trade).length;
          addLog(`✓ Showing ${count} ${trade} activities across all buildings`, 'success');
        } else {
          setColorByTrade(false);
          setFilterTrade(null);
          addLog('Showing all trades', 'info');
        }
        break;
      }
      case 'critical_path': {
        setShowCriticalPath(true);
        const stats = engine.getCriticalPathStats();
        const critIds = new Set(stats.criticalActivities.map(a => a.id));
        setHighlighted(critIds);
        setAnimating(critIds);
        setTimeout(() => setAnimating(new Set()), 3000);
        const topCrit = stats.criticalActivities.slice(0, 5).map(a => `${a.code} (${a.name}, ${a.totalFloat}d float)`).join(', ');
        addLog(`✓ Critical path: ${stats.criticalCount} activities with zero float out of ${stats.totalActivities} total. ${stats.nearCriticalCount} near-critical (≤5d float). Top: ${topCrit}`, 'success');
        break;
      }
      case 'clarify': {
        addLog(`⚠ ${parsed.message}`, 'warning');
        break;
      }
      default: {
        addLog(`⚠ Unrecognized action: ${parsed.action}`, 'warning');
      }
    }
  }, [engine, refresh, highlightDownstream, addLog]);

  // Process command — either via typing or voice
  const processCommand = useCallback(async (input) => {
    if (!input.trim()) return;
    // Auto-stop mic when sending a command
    if (voice.isListening) {
      voice.stopListening();
    }
    addLog(`▸ ${input}`, 'command');
    setIsProcessing(true);
    try {
      const parsed = await interpretCommandWithAI(input, engine.getAllActivitiesList());
      executeAction(parsed);
    } catch (err) {
      addLog(`✗ Error processing command: ${err.message}`, 'error');
    }
    setIsProcessing(false);
  }, [engine, executeAction, addLog, voice]);

  // Sync live voice transcription into the command input field (no auto-submit)
  useEffect(() => {
    if (voice.isListening && voice.liveTranscript) {
      setCommand(voice.liveTranscript);
    }
  }, [voice.liveTranscript, voice.isListening]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && command.trim()) {
      processCommand(command);
      setCommand('');
    }
    if (e.key === 'Escape') {
      setHighlighted(new Set());
      setFilterBuilding(null);
      setSelectedActivity(null);
    }
  };

  const toggleVoice = () => {
    if (voice.micBlocked) {
      addLog('⚠ Mic blocked in this iframe. Use keyboard dictation: Mac → Fn Fn, Windows → Win+H, Mobile → 🎤 on keyboard', 'warning');
      return;
    }
    if (voice.isListening) {
      voice.stopListening();
    } else {
      setCommand('');
      voice.startListening();
      addLog('🎙 Listening... speak your command, then click SEND when done', 'info');
    }
  };

  const stats = useMemo(() => {
    const t = activities.length;
    return {
      total: t,
      completed: activities.filter(a => a.status === 'Completed').length,
      inProgress: activities.filter(a => a.status === 'In Progress').length,
      notStarted: activities.filter(a => a.status === 'Not Started').length,
    };
  }, [activities]);

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#060a14', color: '#e2e8f0',
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* ===== TOP BAR ===== */}
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: '1px solid #1e293b', background: '#0b1120', gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 6,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 11, color: '#fff', letterSpacing: -0.5,
          }}>CIQ</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.3 }}>ConstructIQ</div>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, letterSpacing: 0.5 }}>HB1-4 DATA CENTERS</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, marginLeft: 32 }}>
          {[
            { l: 'Total', v: stats.total, c: '#e2e8f0' },
            { l: 'Done', v: stats.completed, c: '#10b981' },
            { l: 'Active', v: stats.inProgress, c: '#f59e0b' },
            { l: 'Pending', v: stats.notStarted, c: '#64748b' },
          ].map(s => (
            <div key={s.l} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: s.c, fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</span>
              <span style={{ fontSize: 9, color: '#475569', fontWeight: 600 }}>{s.l}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          <button onClick={handleExport} style={{
            padding: '4px 10px', borderRadius: 4, border: 'none',
            background: '#1e293b', color: '#64748b',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          }}>EXPORT P6</button>
          <button onClick={() => {
            setColorByTrade(prev => !prev);
            if (!colorByTrade) {
              addLog('Color by trade division — bars now colored by work discipline', 'info');
            } else {
              addLog('Color by WBS phase', 'info');
            }
          }} style={{
            padding: '4px 10px', borderRadius: 4, border: 'none',
            background: colorByTrade ? '#FACC15' : '#1e293b',
            color: colorByTrade ? '#000' : '#64748b',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          }}>TRADES</button>
          <button onClick={() => {
            const next = !showCriticalPath;
            setShowCriticalPath(next);
            if (next) {
              const critIds = new Set(engine.getCriticalPath().map(a => a.id));
              setHighlighted(critIds);
              addLog(`Critical path: ${critIds.size} activities with zero float`, 'info');
            } else {
              setHighlighted(new Set());
            }
          }} style={{
            padding: '4px 10px', borderRadius: 4, border: 'none',
            background: showCriticalPath ? '#ef4444' : '#1e293b',
            color: showCriticalPath ? '#fff' : '#64748b',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
            marginRight: 8,
          }}>CRIT PATH</button>
          {[null, 1, 2, 3, 4].map(b => (
            <button key={b || 'all'} onClick={() => { setFilterBuilding(b); setHighlighted(new Set()); }}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none',
                background: filterBuilding === b ? '#3b82f6' : '#1e293b',
                color: filterBuilding === b ? '#fff' : '#64748b',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
              }}
            >{b ? `BLDG ${b}` : 'ALL'}</button>
          ))}
        </div>
        {colorByTrade && (
          <div style={{ display: 'flex', gap: 2, marginLeft: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterTrade(null)} style={{
              padding: '3px 8px', borderRadius: 3, border: 'none',
              background: filterTrade === null ? '#3b82f6' : '#1e293b',
              color: filterTrade === null ? '#fff' : '#64748b',
              fontSize: 9, fontWeight: 700, cursor: 'pointer',
            }}>ALL</button>
            {Object.entries(TRADE_COLORS).map(([trade, tc]) => (
              <button key={trade} onClick={() => {
                setFilterTrade(filterTrade === trade ? null : trade);
                if (filterTrade !== trade) addLog(`Filtering to ${trade} across all buildings`, 'info');
              }} style={{
                padding: '3px 8px', borderRadius: 3, border: 'none',
                background: filterTrade === trade ? tc : '#1e293b',
                color: filterTrade === trade ? (tc === '#FACC15' || tc === '#F59E0B' ? '#000' : '#fff') : '#64748b',
                fontSize: 9, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{trade}</button>
            ))}
          </div>
        )}
      </div>

      {/* ===== GANTT ===== */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <GanttChart
          activities={activities} relationships={relationships} engine={engine}
          highlighted={highlighted} animating={animating} filterBuilding={filterBuilding}
          colorByTrade={colorByTrade} filterTrade={filterTrade} showCriticalPath={showCriticalPath}
          onActivityClick={(act) => { setSelectedActivity(act); highlightDownstream(act.id); }}
        />
      </div>

      {/* ===== BOTTOM PANEL ===== */}
      <div style={{ borderTop: '2px solid #1e293b', background: '#0b1120', flexShrink: 0 }}>
        {/* Log */}
        {commandLog.length > 0 && (
          <div style={{ maxHeight: 100, overflowY: 'auto', padding: '4px 16px', borderBottom: '1px solid #1e293b' }}>
            {commandLog.slice(-6).map((log, i) => (
              <div key={log.ts + '-' + i} style={{
                fontSize: 11, padding: '1px 0',
                color: log.type === 'command' ? '#818cf8' : log.type === 'success' ? '#34d399' : log.type === 'error' ? '#f87171' : log.type === 'warning' ? '#fbbf24' : '#475569',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{log.text}</div>
            ))}
          </div>
        )}

        {/* Voice status bar */}
        {(voice.isListening || voice.interimTranscript) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px',
            background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid #1e293b',
          }}>
            <WaveformVisualizer isActive={voice.isListening} />
            <span style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>
              {voice.isListening ? 'Dictating — click SEND when done' : 'Processing...'}
            </span>
            {voice.interimTranscript && (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', flex: 1 }}>
                "{voice.interimTranscript}"
              </span>
            )}
          </div>
        )}

        {isProcessing && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
            background: 'rgba(59,130,246,0.05)', borderBottom: '1px solid #1e293b',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#3b82f6',
              animation: 'pulse-mic 1s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>AI is interpreting your command...</span>
          </div>
        )}

        {/* Error / mic-blocked banner */}
        {voice.error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid #1e293b',
          }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>{voice.error}</div>
              {voice.micBlocked && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, lineHeight: 1.5 }}>
                  <strong style={{ color: '#60a5fa' }}>Workaround:</strong> Use your keyboard's built-in dictation instead —
                  on <strong>Mac</strong> press <span style={{ padding: '1px 5px', background: '#1e293b', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>🌐</span> or <span style={{ padding: '1px 5px', background: '#1e293b', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>Fn Fn</span>,
                  on <strong>Windows</strong> press <span style={{ padding: '1px 5px', background: '#1e293b', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>Win+H</span>,
                  on <strong>mobile</strong> tap the 🎤 icon on your keyboard. Speak naturally — AI will interpret it.
                </div>
              )}
            </div>
            <button onClick={voice.clearError} style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 4,
            }}>×</button>
          </div>
        )}

        {/* Command input row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
          <MicButton
            isListening={voice.isListening}
            isSupported={voice.isSupported}
            isProcessing={isProcessing}
            micBlocked={voice.micBlocked}
            onClick={toggleVoice}
          />
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            background: '#111827', borderRadius: 8, padding: '0 12px',
            border: '1px solid #1e293b',
          }}>
            <span style={{ color: '#3b82f6', fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginRight: 8 }}>▸</span>
            <input
              ref={inputRef}
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voice.micBlocked
                ? 'Type or use keyboard dictation (Mac: Fn Fn, Win: Win+H, Mobile: 🎤) — AI understands natural language!'
                : voice.isSupported
                  ? 'Type a command or click the mic to speak... (e.g., "Create a 10-day Cable Tray Installation in Building 1 MEP")'
                  : 'Type a command... (e.g., "Push SS1210 by 5 days")'}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#e2e8f0', fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                padding: '10px 0',
              }}
            />
          </div>
          <button
            onClick={() => { if (command.trim()) { processCommand(command); setCommand(''); } }}
            disabled={!command.trim() || isProcessing}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: command.trim() && !isProcessing ? '#3b82f6' : '#1e293b',
              color: command.trim() && !isProcessing ? '#fff' : '#475569',
              fontSize: 12, fontWeight: 700, cursor: command.trim() && !isProcessing ? 'pointer' : 'default',
              letterSpacing: 0.5, flexShrink: 0,
            }}
          >SEND</button>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px', flexWrap: 'wrap' }}>
          {[
            'Add a 10-day Cable Tray Installation to Building 1 MEP',
            'Create a new WBS called Site Utilities in Building 2 with Storm Drain Layout 5 days, Storm Drain Installation 12 days, Utility Connections 8 days',
            'Push the steel erection back by 2 weeks',
            'Link foundation to steel for building 2',
            'Show me building 3',
            'Show all buildings',
          ].map(ex => (
            <button key={ex} onClick={() => { setCommand(ex); inputRef.current?.focus(); }}
              style={{
                padding: '3px 8px', borderRadius: 3, border: '1px solid #1e293b', background: '#111827',
                color: '#475569', fontSize: 9, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
              }}
            >{ex}</button>
          ))}
        </div>
      </div>

      {/* ===== SELECTED ACTIVITY PANEL ===== */}
      {selectedActivity && (
        <div style={{
          position: 'absolute', right: 16, top: 68, width: 280,
          background: '#111827', border: '1px solid #1e293b', borderRadius: 10,
          padding: 16, zIndex: 100, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', borderRadius: '10px 0 0 10px', background: getWbsColor(selectedActivity.wbs) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{selectedActivity.code}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedActivity.name}</div>
            </div>
            <button onClick={() => { setSelectedActivity(null); setHighlighted(new Set()); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
            {[
              ['WBS', selectedActivity.wbs],
              ['Trade', selectedActivity.trade || 'Unclassified'],
              ['Building', `Building ${selectedActivity.building}`],
              ['Status', selectedActivity.status],
              ['Duration', `${selectedActivity.duration} days`],
              ['Start', formatDate(selectedActivity.calculatedStart || selectedActivity.startDay)],
              ['Finish', formatDate((selectedActivity.calculatedStart || selectedActivity.startDay) + selectedActivity.duration - 1)],
              ['Progress', `${selectedActivity.pctComplete}%`],
              ['Float', `${selectedActivity.totalFloat != null ? selectedActivity.totalFloat : '—'}d${selectedActivity.isCritical ? ' ⚠ CRITICAL' : ''}`],
              ['Late Start', selectedActivity.lateStart != null ? formatDate(selectedActivity.lateStart) : '—'],
              ['Late Finish', selectedActivity.lateFinish != null ? formatDate(selectedActivity.lateFinish) : '—'],
              ['Downstream', `${engine.getDownstream(selectedActivity.id).size} activities`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{l}</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
