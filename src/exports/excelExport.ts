import * as XLSX from 'xlsx';
import { ChargingSession } from '../types/battery';
import { generateSessionDiagnosis } from '../calculations/batteryCalculations';

/**
 * Generates and downloads the comprehensive multi-sheet Excel workbook.
 */
export function exportSessionToExcel(session: ChargingSession) {
  const diagnosis = session.diagnosis || generateSessionDiagnosis(session);
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // SHEET 0 (DEMO ONLY): WARNING
  // -------------------------------------------------------------
  if (diagnosis.isDemo) {
    const warningText =
      'WARNING: THIS WORKBOOK CONTAINS DEMO / SIMULATED DATA — NOT REAL PHYSICAL MEASUREMENTS. NOT FOR ENGINEERING, SAFETY, OR COMMERCIAL USE. NO WARRANTY.';
    const wsWarning = XLSX.utils.aoa_to_sheet([[warningText]]);
    wsWarning['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    wsWarning['!cols'] = [{ wch: 120 }];
    const warningCell = wsWarning['A1'];
    if (warningCell) {
      warningCell.s = {
        font: { bold: true, sz: 14, color: { rgb: '991B1B' } },
        fill: { fgColor: { rgb: 'FEE2E2' }, patternType: 'solid' },
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
      };
    }
    XLSX.utils.book_append_sheet(wb, wsWarning, 'WARNING');
  }

  // -------------------------------------------------------------
  // SHEET (REFERENCE FORMAT)
  // Exact required column order:
  // 1. v
  // 2. i
  // 3. t in min
  // 4. t in hours
  // 5. dt
  // 6. Energy
  // 7. charge count
  // 8. mAH
  // 9. % charge
  // -------------------------------------------------------------
  const refHeaders = [
    'v',
    'i',
    't in min',
    't in hours',
    'dt',
    'Energy',
    'charge count',
    'mAH',
    '% charge',
  ];

  const refRows = session.readings.map((r) => [
    r.voltage,
    r.current,
    r.elapsedMinutes,
    r.elapsedHours,
    r.dt, // dt in hours
    r.cumulativeEnergy, // Energy (Wh)
    r.cumulativeAh, // charge count (Ah)
    r.cumulativeMah, // mAH
    r.batteryPercentage, // % charge
  ]);

  const refSheetData = diagnosis.isDemo
    ? [['WARNING: DEMO/SIMULATED DATA. NOT REAL PHYSICAL MEASUREMENTS. NO WARRANTY EXPRESSED OR IMPLIED.'], refHeaders, ...refRows]
    : [refHeaders, ...refRows];

  const wsReference = XLSX.utils.aoa_to_sheet(refSheetData);
  wsReference['!cols'] = [
    { wch: 10 }, // v
    { wch: 10 }, // i
    { wch: 12 }, // t in min
    { wch: 12 }, // t in hours
    { wch: 10 }, // dt
    { wch: 14 }, // Energy
    { wch: 14 }, // charge count
    { wch: 12 }, // mAH
    { wch: 10 }, // % charge
  ];

  if (diagnosis.isDemo) {
    wsReference['!merges'] = wsReference['!merges'] || [];
    wsReference['!merges'].unshift({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });
    const demoWarningCell = wsReference['A1'];
    if (demoWarningCell) {
      demoWarningCell.s = {
        font: { bold: true, color: { rgb: '991B1B' } },
        alignment: { wrapText: true },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, wsReference, 'REFERENCE FORMAT');

  // -------------------------------------------------------------
  // SHEET 2: RAW DATA
  // -------------------------------------------------------------
  const rawHeaders = [
    'Sample ID',
    'Session ID',
    'Date',
    'Exact Timestamp',
    'Elapsed Seconds',
    'Elapsed Minutes',
    'Elapsed Hours',
    'Voltage (V)',
    'Current (A)',
    'Battery Percentage (%)',
    'Power (W)',
    'dt (hours)',
    'Energy (Wh)',
    'Cumulative Energy (Wh)',
    'Ah',
    'Cumulative Ah',
    'mAh',
    'Cumulative mAh',
    'Raw OCR Voltage',
    'Raw OCR Current',
    'Raw OCR %',
    'Corrected Value',
    'OCR Confidence (%)',
    'Source',
    'Validation Status',
    'Notes',
  ];

  const rawRows = session.readings.map((r) => [
    r.sampleId,
    r.sessionId,
    r.date,
    r.exactTimestamp,
    r.elapsedSeconds,
    r.elapsedMinutes,
    r.elapsedHours,
    r.voltage,
    r.current,
    r.batteryPercentage,
    r.power,
    r.dt,
    r.energy,
    r.cumulativeEnergy,
    r.ah,
    r.cumulativeAh,
    r.mah,
    r.cumulativeMah,
    r.rawOcrValue?.voltage ?? r.voltage,
    r.rawOcrValue?.current ?? r.current,
    r.rawOcrValue?.batteryPercentage ?? r.batteryPercentage,
    r.correctedValue
      ? `${r.correctedValue.voltage}V, ${r.correctedValue.current}A, ${r.correctedValue.batteryPercentage}%`
      : 'None',
    r.ocrConfidence,
    r.source,
    r.validationStatus,
    r.notes || '',
  ]);

  const wsRaw = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
  wsRaw['!cols'] = [
    { wch: 18 }, // Sample ID
    { wch: 18 }, // Session ID
    { wch: 12 }, // Date
    { wch: 24 }, // Exact Timestamp
    { wch: 16 }, // Elapsed Seconds
    { wch: 16 }, // Elapsed Minutes
    { wch: 16 }, // Elapsed Hours
    { wch: 14 }, // Voltage
    { wch: 14 }, // Current
    { wch: 20 }, // Battery %
    { wch: 14 }, // Power
    { wch: 12 }, // dt
    { wch: 14 }, // Energy
    { wch: 20 }, // Cumulative Energy
    { wch: 12 }, // Ah
    { wch: 16 }, // Cumulative Ah
    { wch: 12 }, // mAh
    { wch: 16 }, // Cumulative mAh
    { wch: 16 }, // Raw V
    { wch: 16 }, // Raw I
    { wch: 16 }, // Raw %
    { wch: 22 }, // Corrected Value
    { wch: 18 }, // OCR Confidence
    { wch: 12 }, // Source
    { wch: 18 }, // Validation Status
    { wch: 24 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, wsRaw, 'RAW DATA');

  // -------------------------------------------------------------
  // SHEET 3: 1% TRANSITION REPORT
  // -------------------------------------------------------------
  const transHeaders = [
    'Transition ID',
    'Start %',
    'End %',
    'Start Timestamp',
    'End Timestamp',
    'Duration (s)',
    'Duration (min)',
    'Average Voltage (V)',
    'Average Current (A)',
    'Average Power (W)',
    'Energy (Wh)',
    'mAh',
    'Minimum Voltage (V)',
    'Maximum Voltage (V)',
    'Minimum Current (A)',
    'Maximum Current (A)',
    'Sample Count',
    'Confidence (%)',
    'Status',
    'Notes',
  ];

  const transRows = session.transitions.map((t) => [
    t.transitionId,
    t.startPercentage,
    t.endPercentage,
    t.startTimestamp,
    t.endTimestamp,
    t.duration,
    Number((t.duration / 60).toFixed(2)),
    t.averageVoltage,
    t.averageCurrent,
    t.averagePower,
    t.energy,
    t.mah,
    t.minimumVoltage,
    t.maximumVoltage,
    t.minimumCurrent,
    t.maximumCurrent,
    t.sampleCount,
    t.confidence,
    t.status,
    t.notes || '',
  ]);

  const wsTransitions = XLSX.utils.aoa_to_sheet([transHeaders, ...transRows]);
  wsTransitions['!cols'] = [
    { wch: 16 }, // Transition ID
    { wch: 10 }, // Start %
    { wch: 10 }, // End %
    { wch: 24 }, // Start Timestamp
    { wch: 24 }, // End Timestamp
    { wch: 14 }, // Duration s
    { wch: 14 }, // Duration min
    { wch: 18 }, // Avg Voltage
    { wch: 18 }, // Avg Current
    { wch: 18 }, // Avg Power
    { wch: 14 }, // Energy
    { wch: 14 }, // mAh
    { wch: 18 }, // Min V
    { wch: 18 }, // Max V
    { wch: 18 }, // Min I
    { wch: 18 }, // Max I
    { wch: 14 }, // Sample Count
    { wch: 16 }, // Confidence
    { wch: 18 }, // Status
    { wch: 32 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, wsTransitions, '1% TRANSITION REPORT');

  // -------------------------------------------------------------
  // SHEET 4: DIAGNOSIS SUMMARY
  // -------------------------------------------------------------
  const diagData: (string | number)[][] = [
    ['BATTERY CHARGING PERFORMANCE & DIAGNOSIS SYSTEM', ''],
    ['Executive Engineering Diagnosis Report', ''],
    ['Report Generated', new Date().toISOString()],
    ['', ''],
    ['1. IDENTIFICATION & SESSION DETAILS', ''],
    ['Report ID', diagnosis.reportId],
    ['Session ID', diagnosis.sessionId],
    ['Mode', diagnosis.isDemo ? 'DEMO MODE (Simulated Hardware)' : 'PHYSICAL HARDWARE (Live Camera & Meters)'],
    ['Battery ID', diagnosis.batteryId],
    ['Battery Name', diagnosis.batteryName],
    ['Battery Chemistry', diagnosis.batteryChemistry],
    ['Battery Capacity (mAh)', diagnosis.batteryCapacity],
    ['Charger Name', diagnosis.charger],
    ['Operator Name', diagnosis.operator],
    ['Session Start Timestamp', diagnosis.startTimestamp],
    ['Session End Timestamp', diagnosis.endTimestamp],
    ['Total Duration (Seconds)', diagnosis.totalDurationSeconds],
    ['Total Duration (Minutes)', Number((diagnosis.totalDurationSeconds / 60).toFixed(2))],
    ['', ''],
    ['2. CHARGING SUMMARY METRICS', ''],
    ['Starting Battery Percentage', `${diagnosis.startingPercentage} %`],
    ['Ending Battery Percentage', `${diagnosis.endingPercentage} %`],
    ['Total Percentage Increase', `${diagnosis.totalPercentageIncrease} %`],
    ['Starting Terminal Voltage', `${diagnosis.startingVoltage} V`],
    ['Ending Terminal Voltage', `${diagnosis.endingVoltage} V`],
    ['Minimum Voltage Recorded', `${diagnosis.minimumVoltage} V`],
    ['Maximum Voltage Recorded', `${diagnosis.maximumVoltage} V`],
    ['Average Voltage', `${diagnosis.averageVoltage} V`],
    ['Starting Current', `${diagnosis.startingCurrent} A`],
    ['Ending Current', `${diagnosis.endingCurrent} A`],
    ['Minimum Current Recorded', `${diagnosis.minimumCurrent} A`],
    ['Maximum Current Recorded', `${diagnosis.maximumCurrent} A`],
    ['Average Current', `${diagnosis.averageCurrent} A`],
    ['Average Power Delivery', `${diagnosis.averagePower} W`],
    ['Peak Power Delivery', `${diagnosis.maximumPower} W`],
    ['Total Net Energy Delivered', `${diagnosis.totalEnergyWh} Wh`],
    ['Total Net Charge Delivered (Ah)', `${diagnosis.totalAh} Ah`],
    ['Total Net Charge Delivered (mAh)', `${diagnosis.totalMah} mAh`],
    ['Total Reading Samples Captured', diagnosis.totalSamples],
    ['Average OCR Reading Confidence', `${diagnosis.averageOcrConfidence} %`],
    ['Data Quality Score', `${diagnosis.dataQualityScore} / 100`],
    ['', ''],
    ['3. CHARGING BEHAVIOR ANALYSIS', ''],
    ['Voltage Curve Characteristic', diagnosis.voltageBehavior],
    ['Current Curve Characteristic', diagnosis.currentBehavior],
    ['Power Profile', diagnosis.powerBehavior],
    ['Observed Charging Speed', diagnosis.chargingSpeed],
    ['Slowest 1% Transition Band', diagnosis.slowChargingRanges],
    ['Fastest 1% Transition Band', diagnosis.fastChargingRanges],
    ['Transition Consistency', diagnosis.percentageTransitionConsistency],
    ['Charging Stability Assessment', diagnosis.chargingStability],
    ['', ''],
    ['4. MAIN FINDINGS', ''],
    ...diagnosis.mainFindings.map((f, idx) => [`Finding ${idx + 1}`, f]),
    ['', ''],
    ['5. ACTIVE WARNINGS & NOTICES', ''],
    ...(diagnosis.warnings.length > 0
      ? diagnosis.warnings.map((w, idx) => [`Warning ${idx + 1}`, w])
      : [['Notice', 'No abnormal warnings observed across session.']]),
    ['', ''],
    ['6. METHODOLOGY & CALCULATION NOTES', ''],
    ...diagnosis.calculationNotes.map((c, idx) => [`Note ${idx + 1}`, c]),
  ];

  const wsDiagnosis = XLSX.utils.aoa_to_sheet(diagData);
  wsDiagnosis['!cols'] = [{ wch: 34 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsDiagnosis, 'DIAGNOSIS SUMMARY');

  // -------------------------------------------------------------
  // SHEET 5: ABNORMALITY ANALYSIS
  // -------------------------------------------------------------
  const abnHeaders = [
    'Issue ID',
    'Timestamp',
    'Issue Type',
    'Measurement',
    'Expected Rule',
    'Observed Value',
    'Severity',
    'Confidence (%)',
    'Status',
    'Recommended Review Action',
  ];

  const abnRows =
    diagnosis.abnormalities.length > 0
      ? diagnosis.abnormalities.map((a) => [
          a.issueId,
          a.timestamp,
          a.issueType,
          a.measurement,
          a.expectedRule,
          a.observedValue,
          a.severity,
          a.confidence,
          a.status,
          a.recommendedReviewAction,
        ])
      : [
          [
            'None',
            '-',
            'No Abnormalities Detected',
            '-',
            'Safe CC/CV charging profile',
            'Within tolerance',
            'Info',
            100,
            'Resolved',
            'Session parameters are healthy; normal charging protocol observed.',
          ],
        ];

  const wsAbnormalities = XLSX.utils.aoa_to_sheet([abnHeaders, ...abnRows]);
  wsAbnormalities['!cols'] = [
    { wch: 14 }, // Issue ID
    { wch: 24 }, // Timestamp
    { wch: 26 }, // Issue Type
    { wch: 28 }, // Measurement
    { wch: 42 }, // Expected Rule
    { wch: 18 }, // Observed Value
    { wch: 12 }, // Severity
    { wch: 14 }, // Confidence
    { wch: 12 }, // Status
    { wch: 45 }, // Action
  ];
  XLSX.utils.book_append_sheet(wb, wsAbnormalities, 'ABNORMALITY ANALYSIS');

  // -------------------------------------------------------------
  // SHEET 6: CHARTS (Chart-ready time series and 1% transition tables)
  // -------------------------------------------------------------
  const chartHeaders = [
    'Time (min)',
    'Voltage (V)',
    'Current (A)',
    'Power (W)',
    'Battery %',
    'Energy (Wh)',
    'mAh',
  ];

  const chartRows = session.readings.map((r) => [
    r.elapsedMinutes,
    r.voltage,
    r.current,
    r.power,
    r.batteryPercentage,
    r.cumulativeEnergy,
    r.cumulativeMah,
  ]);

  const wsCharts = XLSX.utils.aoa_to_sheet([
    ['CHARGING PERFORMANCE TIME SERIES DATA (Use for Native Excel Scatter/Line Charts)', '', '', '', '', '', ''],
    chartHeaders,
    ...chartRows,
    ['', '', '', '', '', '', ''],
    ['1% TRANSITION DURATION PROFILE (Use for Bar/Column Chart of Seconds per 1% SoC)', '', '', '', '', '', ''],
    ['Transition', 'Start %', 'End %', 'Duration (seconds)', 'Average Voltage (V)', 'Average Current (A)', 'Energy (Wh)'],
    ...session.transitions.map((t) => [
      `${t.startPercentage}% -> ${t.endPercentage}%`,
      t.startPercentage,
      t.endPercentage,
      t.duration,
      t.averageVoltage,
      t.averageCurrent,
      t.energy,
    ]),
  ]);

  wsCharts['!cols'] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCharts, 'CHARTS DATA');

  // Write and trigger browser file download
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Battery_Charging_Report_${session.batteryId}_${session.sessionId}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Exports the main reference sheet as standard CSV.
 */
export function exportSessionToCSV(session: ChargingSession) {
  const refHeaders = [
    'v',
    'i',
    't in min',
    't in hours',
    'dt',
    'Energy',
    'charge count',
    'mAH',
    '% charge',
  ];

  const refRows = session.readings.map((r) => [
    r.voltage,
    r.current,
    r.elapsedMinutes,
    r.elapsedHours,
    r.dt,
    r.cumulativeEnergy,
    r.cumulativeAh,
    r.cumulativeMah,
    r.batteryPercentage,
  ]);

  const csvContent = [
    refHeaders.join(','),
    ...refRows.map((row) => row.join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `Battery_Charging_Reference_${session.sessionId}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
