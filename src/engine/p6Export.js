// ============================================================
// p6Export.js — Export schedule to P6-compatible Excel
// ============================================================
import * as XLSX from 'xlsx';
import { dayToDate, PROJECT_START } from './sampleData.js';

function dayToP6Date(day) {
    const d = dayToDate(day);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mmm}-${yy} 08:00`;
}

function mapStatus(status) {
    switch (status) {
        case 'Completed': return 'TK_Complete';
        case 'In Progress': return 'TK_Active';
        case 'Not Started': return 'TK_NotStart';
        default: return 'TK_NotStart';
    }
}

function mapActivityType(act) {
    if (act.duration === 0) return 'TT_Mile';
    return 'TT_Task';
}

export function exportToP6Excel(engine, projectName = 'HB1-4 Data Centers') {
    const activities = engine.getAllActivitiesList();
    const relationships = engine.relationships || [];

    // TASK sheet
    const taskHeaders = [
        'Activity ID', 'Activity Name', 'WBS', 'Activity Type',
        'Original Duration', 'Remaining Duration', 'Activity % Complete',
        'Activity Status', 'Start', 'Finish', 'Early Start', 'Early Finish',
        'Late Start', 'Late Finish', 'Total Float', 'Calendar Name', 'Project ID',
    ];

    const taskRows = activities.map(act => {
        const es = act.earlyStart != null ? act.earlyStart : act.startDay;
        const ef = act.earlyFinish != null ? act.earlyFinish : (act.startDay + act.duration - 1);
        const ls = act.lateStart != null ? act.lateStart : es;
        const lf = act.lateFinish != null ? act.lateFinish : ef;
        const tf = act.totalFloat != null ? act.totalFloat : 0;
        const remainDur = act.status === 'Completed' ? 0
            : act.status === 'In Progress' ? Math.round(act.duration * (1 - (act.pctComplete || 0) / 100))
                : act.duration;

        return [
            act.code, act.name, act.wbs, mapActivityType(act),
            act.duration, remainDur, act.pctComplete || 0,
            mapStatus(act.status), dayToP6Date(es), dayToP6Date(ef),
            dayToP6Date(es), dayToP6Date(ef), dayToP6Date(ls), dayToP6Date(lf),
            tf, 'Standard 5 Day', projectName,
        ];
    });

    // TASKPRED sheet
    const predHeaders = ['Activity ID', 'Predecessor Activity ID', 'Predecessor Type', 'Lag'];
    const predRows = relationships.map(r => [
        r.successor, r.predecessor, r.type || 'FS', r.lag || 0,
    ]);

    // WBS sheet
    const wbsList = engine.getWBSList();
    const wbsHeaders = ['WBS Code', 'WBS Name', 'Parent WBS Code', 'Project ID'];
    const wbsRows = wbsList.map(w => {
        const parts = w.wbs.split('.');
        const parentWbs = parts.length > 1 ? parts[0] : '';
        return [w.wbs, w.wbsName, parentWbs, projectName];
    });

    // PROJECT sheet
    const projectHeaders = ['Project ID', 'Project Name', 'Planned Start'];
    const projectRows = [[projectName, projectName, dayToP6Date(0)]];

    // Build workbook
    const wb = XLSX.utils.book_new();

    const taskSheet = XLSX.utils.aoa_to_sheet([taskHeaders, ...taskRows]);
    taskSheet['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 22 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, taskSheet, 'TASK');

    const predSheet = XLSX.utils.aoa_to_sheet([predHeaders, ...predRows]);
    predSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, predSheet, 'TASKPRED');

    const wbsSheet = XLSX.utils.aoa_to_sheet([wbsHeaders, ...wbsRows]);
    wbsSheet['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wbsSheet, 'WBS');

    const projectSheet = XLSX.utils.aoa_to_sheet([projectHeaders, ...projectRows]);
    projectSheet['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, projectSheet, 'PROJECT');

    // Trigger download
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `ConstructIQ_P6_Export_${timestamp}.xlsx`;
    XLSX.writeFile(wb, filename);

    return {
        filename,
        activityCount: activities.length,
        relationshipCount: relationships.length,
        wbsCount: wbsList.length,
    };
}
