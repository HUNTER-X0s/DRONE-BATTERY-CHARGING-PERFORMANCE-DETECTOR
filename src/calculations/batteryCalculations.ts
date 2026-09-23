import {
  Reading,
  Transition,
  DiagnosisReport,
  AbnormalityIssue,
  DiagnosisStatus,
  ChargingSession,
  ValidationStatus,
  ReadingSource,
} from '../types/battery';

/**
 * Calculates a single reading given the raw inputs and the previous reading.
 */
export function calculateReadingMetrics(
  currentTimestampMs: number,
  sessionStartTimestampMs: number,
  voltage: number,
  current: number,
  batteryPercentage: number,
  prevReading?: Reading,
  ocrConfidence: number = 95,
  source: ReadingSource = 'OCR',
  validationStatus: ValidationStatus = 'Verified',
  notes?: string
): Reading {
  const elapsedSeconds = Math.max(0, (currentTimestampMs - sessionStartTimestampMs) / 1000);
  const elapsedMinutes = elapsedSeconds / 60;
  const elapsedHours = elapsedSeconds / 3600;

  // Power in Watts (W) = Voltage (V) * Current (A)
  const safeVoltage = Math.max(0, Number(voltage.toFixed(3)));
  const safeCurrent = Math.max(0, Number(current.toFixed(3)));
  const safePercentage = Math.min(100, Math.max(0, Math.round(batteryPercentage)));
  const power = Number((safeVoltage * safeCurrent).toFixed(3));

  // dt calculation based on exact timestamp difference
  let dtSeconds = 0;
  let dtHours = 0;
  let intervalEnergyWh = 0;
  let intervalAh = 0;
  let intervalMah = 0;
  let cumulativeEnergy = 0;
  let cumulativeAh = 0;
  let cumulativeMah = 0;

  if (prevReading) {
    dtSeconds = Math.max(0, (currentTimestampMs - prevReading.timestampMs) / 1000);
    dtHours = dtSeconds / 3600;

    // Numerical integration using trapezoidal or right Riemann rule with actual dt
    // Using average voltage & current across interval for superior physical accuracy:
    const avgV = (safeVoltage + prevReading.voltage) / 2;
    const avgI = (safeCurrent + prevReading.current) / 2;

    intervalAh = avgI * dtHours;
    intervalMah = intervalAh * 1000;
    intervalEnergyWh = avgV * avgI * dtHours;

    cumulativeAh = prevReading.cumulativeAh + intervalAh;
    cumulativeMah = cumulativeAh * 1000;
    cumulativeEnergy = prevReading.cumulativeEnergy + intervalEnergyWh;
  }

  const dateObj = new Date(currentTimestampMs);
  const dateStr = dateObj.toISOString().slice(0, 10);
  const exactTimestamp = dateObj.toISOString();

  const safeRandomSuffix = () => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      }
    } catch (_) { /* ignore */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  return {
    sampleId: `SMP-${currentTimestampMs}-${safeRandomSuffix()}`,
    sessionId: prevReading ? prevReading.sessionId : '',
    date: dateStr,
    exactTimestamp,
    timestampMs: currentTimestampMs,
    elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
    elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
    elapsedHours: Number(elapsedHours.toFixed(4)),
    voltage: safeVoltage,
    current: safeCurrent,
    batteryPercentage: safePercentage,
    power: Number(power.toFixed(3)),
    dt: Number(dtHours.toFixed(5)),
    dtSeconds: Number(dtSeconds.toFixed(1)),
    energy: Number(intervalEnergyWh.toFixed(4)),
    cumulativeEnergy: Number(cumulativeEnergy.toFixed(4)),
    ah: Number(intervalAh.toFixed(4)),
    cumulativeAh: Number(cumulativeAh.toFixed(4)),
    mah: Number(intervalMah.toFixed(2)),
    cumulativeMah: Number(cumulativeMah.toFixed(2)),
    rawOcrValue: {
      voltage: safeVoltage,
      current: safeCurrent,
      batteryPercentage: safePercentage,
    },
    ocrConfidence: Math.round(ocrConfidence),
    source,
    validationStatus,
    notes,
  };
}

/**
 * Calculates 1% transitions across the charging session.
 * Rule: A transition (P% -> P+1%) begins at the earliest stable sample of P%
 * and completes at the first verified sample of P+1%.
 * If gaps are observed (e.g. 24% to 26%), 24%->25% is marked 'Incomplete Transition'
 * or 'Missing Data' without fabricating false data.
 */
export function calculateOnePercentTransitions(readings: Reading[]): Transition[] {
  if (readings.length < 2) return [];

  const sorted = [...readings].sort((a, b) => a.timestampMs - b.timestampMs);
  const startPct = sorted[0].batteryPercentage;
  const endPct = sorted[sorted.length - 1].batteryPercentage;

  const transitions: Transition[] = [];

  // Group readings by battery percentage
  const readingsByPct = new Map<number, Reading[]>();
  for (const r of sorted) {
    const arr = readingsByPct.get(r.batteryPercentage) || [];
    arr.push(r);
    readingsByPct.set(r.batteryPercentage, arr);
  }

  // Iterate over expected 1% steps from minimum observed to maximum observed
  for (let p = startPct; p < endPct; p++) {
    const nextP = p + 1;
    const currentSamples = readingsByPct.get(p) || [];
    const nextSamples = readingsByPct.get(nextP) || [];

    const transitionId = `TRN-${p}-${nextP}`;

    if (currentSamples.length === 0 || nextSamples.length === 0) {
      // Missing transition data
      transitions.push({
        transitionId,
        startPercentage: p,
        endPercentage: nextP,
        startTimestamp: currentSamples[0]?.exactTimestamp || 'N/A',
        endTimestamp: nextSamples[0]?.exactTimestamp || 'N/A',
        startElapsedSeconds: currentSamples[0]?.elapsedSeconds ?? 0,
        endElapsedSeconds: nextSamples[0]?.elapsedSeconds ?? 0,
        duration: 0,
        averageVoltage: 0,
        averageCurrent: 0,
        averagePower: 0,
        energy: 0,
        mah: 0,
        minimumVoltage: 0,
        maximumVoltage: 0,
        minimumCurrent: 0,
        maximumCurrent: 0,
        sampleCount: 0,
        confidence: 0,
        status: 'Missing Data',
        notes: `Percentage jumped directly from ${currentSamples[0]?.batteryPercentage ?? 'prior'}% without recorded transition at ${p}% to ${nextP}%.`,
      });
      continue;
    }

    // Earliest sample of current percentage to earliest sample of next percentage
    const startSample = currentSamples[0];
    const endSample = nextSamples[0];

    // Samples within this time window
    const spanSamples = sorted.filter(
      (s) => s.timestampMs >= startSample.timestampMs && s.timestampMs <= endSample.timestampMs
    );

    const durationSeconds = Math.max(1, (endSample.timestampMs - startSample.timestampMs) / 1000);
    const voltages = spanSamples.map((s) => s.voltage);
    const currents = spanSamples.map((s) => s.current);
    const powers = spanSamples.map((s) => s.power);

    const minV = Math.min(...voltages);
    const maxV = Math.max(...voltages);
    const minI = Math.min(...currents);
    const maxI = Math.max(...currents);

    const avgV = voltages.reduce((a, b) => a + b, 0) / voltages.length;
    const avgI = currents.reduce((a, b) => a + b, 0) / currents.length;
    const avgP = powers.reduce((a, b) => a + b, 0) / powers.length;

    // Delta energy and mAh between start and end
    const energyDelta = Math.max(0, endSample.cumulativeEnergy - startSample.cumulativeEnergy);
    const mahDelta = Math.max(0, endSample.cumulativeMah - startSample.cumulativeMah);

    const avgConf =
      spanSamples.reduce((acc, s) => acc + s.ocrConfidence, 0) / spanSamples.length;

    let status: Transition['status'] = 'Normal';
    let notes = 'Standard 1% CC/CV transition recorded.';

    if (avgConf < 70) {
      status = 'Requires Review';
      notes = 'Low OCR confidence during percentage transition.';
    } else if (durationSeconds > 1800) {
      status = 'Requires Review';
      notes = 'Unusually slow transition duration (>30 min for 1%).';
    } else if (spanSamples.length < 2) {
      status = 'Incomplete Transition';
      notes = 'Few sample points captured for this 1% step.';
    }

    transitions.push({
      transitionId,
      startPercentage: p,
      endPercentage: nextP,
      startTimestamp: startSample.exactTimestamp,
      endTimestamp: endSample.exactTimestamp,
      startElapsedSeconds: startSample.elapsedSeconds,
      endElapsedSeconds: endSample.elapsedSeconds,
      duration: Math.round(durationSeconds),
      averageVoltage: Number(avgV.toFixed(3)),
      averageCurrent: Number(avgI.toFixed(3)),
      averagePower: Number(avgP.toFixed(3)),
      energy: Number(energyDelta.toFixed(4)),
      mah: Number(mahDelta.toFixed(2)),
      minimumVoltage: Number(minV.toFixed(3)),
      maximumVoltage: Number(maxV.toFixed(3)),
      minimumCurrent: Number(minI.toFixed(3)),
      maximumCurrent: Number(maxI.toFixed(3)),
      sampleCount: spanSamples.length,
      confidence: Math.round(avgConf),
      status,
      notes,
    });
  }

  return transitions;
}

/**
 * Evaluates session data and generates a rigorous engineering diagnosis report.
 */
export function generateSessionDiagnosis(session: ChargingSession): DiagnosisReport {
  const readings = session.readings;
  const transitions = session.transitions.length > 0 ? session.transitions : calculateOnePercentTransitions(readings);

  const reportId = `RPT-${session.sessionId}`;
  const totalSamples = readings.length;

  const samplingIntervalMs = (session as any).samplingIntervalMs || (session as any).meta?.samplingIntervalMs || 2000;
  const expectedTotalTicks = Math.max(1, Math.ceil(session.totalDurationSeconds * 1000 / samplingIntervalMs));
  let dataCompletenessPct: number;
  if (totalSamples === 0) {
    dataCompletenessPct = 0;
  } else {
    dataCompletenessPct = Math.min(100, Math.round((totalSamples / expectedTotalTicks) * 100));
  }

  if (totalSamples === 0) {
    return {
      reportId,
      sessionId: session.sessionId,
      batteryId: session.batteryId,
      batteryName: session.batteryName,
      batteryChemistry: session.batteryChemistry,
      batteryCapacity: session.batteryCapacity,
      charger: session.chargerName,
      operator: session.operatorName,
      startTimestamp: session.startTimestamp,
      endTimestamp: session.endTimestamp || session.startTimestamp,
      totalDurationSeconds: session.totalDurationSeconds,
      isDemo: session.isDemo,
      startingPercentage: 0,
      endingPercentage: 0,
      totalPercentageIncrease: 0,
      startingVoltage: 0,
      endingVoltage: 0,
      minimumVoltage: 0,
      maximumVoltage: 0,
      averageVoltage: 0,
      startingCurrent: 0,
      endingCurrent: 0,
      minimumCurrent: 0,
      maximumCurrent: 0,
      averageCurrent: 0,
      averagePower: 0,
      maximumPower: 0,
      totalEnergyWh: 0,
      totalAh: 0,
      totalMah: 0,
      totalSamples: 0,
      averageOcrConfidence: 0,
      dataQualityScore: 0,
      voltageBehavior: 'No samples recorded.',
      currentBehavior: 'No samples recorded.',
      powerBehavior: 'No samples recorded.',
      chargingSpeed: 'N/A',
      slowChargingRanges: 'None',
      fastChargingRanges: 'None',
      percentageTransitionConsistency: 'N/A',
      chargingStability: 'Insufficient Data',
      warnings: ['No data collected during this session.', 'Low data completeness: 0% (0/' + expectedTotalTicks + ' expected ticks captured — review camera calibration, lighting, session duration).'],
      abnormalities: [],
      mainFindings: ['Session ended without recorded readings.', 'Data completeness: 0% (0/' + expectedTotalTicks + ' expected ticks captured).'],
      calculationNotes: ['No numeric integration possible.'],
    };
  }

  const voltages = readings.map((r) => r.voltage);
  const currents = readings.map((r) => r.current);
  const powers = readings.map((r) => r.power);
  const confidences = readings.map((r) => r.ocrConfidence);

  const startingPercentage = readings[0].batteryPercentage;
  const endingPercentage = readings[readings.length - 1].batteryPercentage;
  const totalPercentageIncrease = Math.max(0, endingPercentage - startingPercentage);

  const startingVoltage = readings[0].voltage;
  const endingVoltage = readings[readings.length - 1].voltage;
  const minimumVoltage = Math.min(...voltages);
  const maximumVoltage = Math.max(...voltages);
  const averageVoltage = Number((voltages.reduce((a, b) => a + b, 0) / totalSamples).toFixed(3));

  const startingCurrent = readings[0].current;
  const endingCurrent = readings[readings.length - 1].current;
  const minimumCurrent = Math.min(...currents);
  const maximumCurrent = Math.max(...currents);
  const averageCurrent = Number((currents.reduce((a, b) => a + b, 0) / totalSamples).toFixed(3));

  const averagePower = Number((powers.reduce((a, b) => a + b, 0) / totalSamples).toFixed(3));
  const maximumPower = Number(Math.max(...powers).toFixed(3));

  const lastReading = readings[readings.length - 1];
  const totalEnergyWh = Number(lastReading.cumulativeEnergy.toFixed(4));
  const totalAh = Number(lastReading.cumulativeAh.toFixed(4));
  const totalMah = Number(lastReading.cumulativeMah.toFixed(2));

  const avgConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / totalSamples);

  // Analyze Abnormalities & Warnings
  const warnings: string[] = [];
  const abnormalities: AbnormalityIssue[] = [];

  // 1. Check for sudden voltage drop (> 0.5V drop during active charge)
  for (let i = 1; i < readings.length; i++) {
    const vDiff = readings[i - 1].voltage - readings[i].voltage;
    if (vDiff > 0.45 && readings[i].current > 0.2) {
      const issue: AbnormalityIssue = {
        issueId: `ABN-V-${i}`,
        timestamp: readings[i].exactTimestamp,
        issueType: 'Sudden Voltage Drop',
        measurement: `${readings[i - 1].voltage.toFixed(2)}V -> ${readings[i].voltage.toFixed(2)}V (-${vDiff.toFixed(2)}V)`,
        expectedRule: 'Battery terminal voltage should monotonically rise or remain flat in CC mode.',
        observedValue: `${readings[i].voltage} V`,
        severity: 'Warning',
        confidence: readings[i].ocrConfidence,
        status: 'Open',
        recommendedReviewAction: 'Inspect battery connector contact resistance and charger terminal clamping.',
      };
      abnormalities.push(issue);
      warnings.push(`Sudden voltage drop of ${vDiff.toFixed(2)}V observed at ${readings[i].exactTimestamp.slice(11, 19)}.`);
      break;
    }
  }

  // 2. Check for sudden current spikes or drops
  for (let i = 1; i < readings.length; i++) {
    const iDiff = Math.abs(readings[i].current - readings[i - 1].current);
    if (iDiff > 2.5) {
      abnormalities.push({
        issueId: `ABN-I-${i}`,
        timestamp: readings[i].exactTimestamp,
        issueType: 'Sudden Current Fluctuation',
        measurement: `Delta of ${iDiff.toFixed(2)} A`,
        expectedRule: 'Current changes should follow CC ramp or smooth CV exponential taper.',
        observedValue: `${readings[i].current} A`,
        severity: 'Warning',
        confidence: readings[i].ocrConfidence,
        status: 'Open',
        recommendedReviewAction: 'Check meter shunt calibration or AC grid surge stability.',
      });
      warnings.push(`Severe current shift of ${iDiff.toFixed(2)}A at ${readings[i].exactTimestamp.slice(11, 19)}.`);
      break;
    }
  }

  // 3. Check for percentage jumps (skipped percentage)
  for (let i = 1; i < readings.length; i++) {
    const pDiff = readings[i].batteryPercentage - readings[i - 1].batteryPercentage;
    if (pDiff > 2) {
      abnormalities.push({
        issueId: `ABN-P-${i}`,
        timestamp: readings[i].exactTimestamp,
        issueType: 'Percentage Jump (Skipped Step)',
        measurement: `${readings[i - 1].batteryPercentage}% -> ${readings[i].batteryPercentage}% (+${pDiff}%)`,
        expectedRule: 'BMS state of charge should increment by 1% intervals during steady charging.',
        observedValue: `${readings[i].batteryPercentage}%`,
        severity: 'Info',
        confidence: readings[i].ocrConfidence,
        status: 'Open',
        recommendedReviewAction: 'Review OCR video stream around this timestamp for occluded digits or BMS recalculation.',
      });
      warnings.push(`Percentage jump of +${pDiff}% observed at ${readings[i].exactTimestamp.slice(11, 19)}.`);
      break;
    }
  }

  // 4. Low OCR confidence checks
  const lowConfCount = readings.filter((r) => r.ocrConfidence < 70).length;
  if (lowConfCount > 0) {
    warnings.push(`${lowConfCount} reading(s) had OCR confidence below 70% threshold.`);
  }

  // 5. Low data completeness check
  if (dataCompletenessPct < 80) {
    warnings.push(`Low data completeness: ${dataCompletenessPct}% (${totalSamples}/${expectedTotalTicks} expected ticks captured — review camera calibration, lighting, session duration).`);
  }

  // Determine Data Quality Score
  let dataQuality = 100;
  if (avgConfidence < 85) dataQuality -= (85 - avgConfidence);
  dataQuality -= abnormalities.length * 8;
  dataQuality -= (lowConfCount / totalSamples) * 20;
  const dataQualityScore = Math.max(10, Math.min(100, Math.round(dataQuality)));

  // Determine Charging Behavior Classification
  let voltageBehavior = 'Stable terminal voltage progression.';
  if (endingVoltage > startingVoltage + 0.5) {
    voltageBehavior = 'Normal CC (Constant Current) bulk charging curve with progressive voltage rise.';
  } else if (Math.abs(endingVoltage - startingVoltage) <= 0.2) {
    voltageBehavior = 'CV (Constant Voltage) saturation phase with voltage held near upper cutoff.';
  }

  let currentBehavior = 'Constant current delivery.';
  if (startingCurrent > 0.5 && endingCurrent < startingCurrent * 0.4) {
    currentBehavior = 'CV Taper: Current smoothly declined towards termination threshold.';
  } else if (Math.abs(startingCurrent - endingCurrent) < 0.2) {
    currentBehavior = 'CC Constant: Current maintained steadily within ±0.1A of setpoint.';
  }

  let powerBehavior = 'Consistent power delivery profile.';
  if (maximumPower > averagePower * 1.3) {
    powerBehavior = 'Peaked in bulk phase, followed by gradual taper.';
  } else {
    powerBehavior = 'Uniform power input conforming to charger regulation.';
  }

  const totalMinutes = session.totalDurationSeconds / 60;
  const pctPerHour = totalMinutes > 0 ? (totalPercentageIncrease / (totalMinutes / 60)) : 0;
  const chargingSpeed = `${pctPerHour.toFixed(1)}% / hour (Average ~${(session.totalDurationSeconds / Math.max(1, totalPercentageIncrease)).toFixed(0)}s per 1%)`;

  // Find slow and fast 1% transition ranges
  const validTransitions = transitions.filter((t) => t.status === 'Normal' && t.duration > 0);
  let slowChargingRanges = 'None observed';
  let fastChargingRanges = 'None observed';

  if (validTransitions.length >= 3) {
    const sortedDurations = [...validTransitions].sort((a, b) => b.duration - a.duration);
    const slowest = sortedDurations[0];
    const fastest = sortedDurations[sortedDurations.length - 1];
    slowChargingRanges = `${slowest.startPercentage}% to ${slowest.endPercentage}% (${slowest.duration}s)`;
    fastChargingRanges = `${fastest.startPercentage}% to ${fastest.endPercentage}% (${fastest.duration}s)`;
  }

  let percentageTransitionConsistency = 'Even progression across measured bands.';
  if (validTransitions.length > 5) {
    const durs = validTransitions.map((t) => t.duration);
    const maxDur = Math.max(...durs);
    const minDur = Math.min(...durs);
    if (maxDur > minDur * 3) {
      percentageTransitionConsistency = 'Non-linear: Significant slowdown in upper saturation (>80%) or early CC phase.';
    }
  }

  let chargingStability: DiagnosisStatus = 'Normal';
  if (abnormalities.some((a) => a.severity === 'Critical')) {
    chargingStability = 'Possible Abnormality';
  } else if (abnormalities.length > 0 || warnings.length > 2) {
    chargingStability = 'Review Required';
  } else if (totalSamples < 5) {
    chargingStability = 'Insufficient Data';
  } else {
    chargingStability = 'Stable';
  }

  const mainFindings = [
    `Session recorded ${totalSamples} samples across ${Math.round(totalMinutes)} minutes.`,
    `Battery SoC rose from ${startingPercentage}% to ${endingPercentage}% (+${totalPercentageIncrease}%).`,
    `Delivered ${totalEnergyWh.toFixed(2)} Wh of energy and ${totalMah.toFixed(0)} mAh of charge.`,
    `Average power throughput was ${averagePower.toFixed(1)} W (peak ${maximumPower.toFixed(1)} W).`,
  ];

  if (session.isDemo) {
    mainFindings.unshift("⚠️ CRITICAL WARNING: This diagnosis is based on DEMO/SIMULATED DATA, not real physical meter readings. This report is NOT valid for engineering sign-off, safety validation, regulatory compliance, warranty claims, or commercial procurement decisions. This document carries NO warranty, express or implied, of measurement accuracy.");
  }

  if (dataCompletenessPct < 80) {
    mainFindings.push(`Low data completeness: ${dataCompletenessPct}% (${totalSamples}/${expectedTotalTicks} expected ticks captured — review camera calibration, lighting, session duration).`);
  }

  if (session.isDemo) {
    mainFindings.push('Note: This session was performed in DEMO MODE with simulated physical parameters.');
  }

  const calculationNotes = [
    'dt calculated as exact timestamp delta in hours: dt = (t_n - t_{n-1}) / 3600.',
    'Energy integration uses trapezoidal approximation: dE = ((V_n + V_{n-1})/2) * ((I_n + I_{n-1})/2) * dt.',
    'Charge capacity: dAh = ((I_n + I_{n-1})/2) * dt; mAh = dAh * 1000.',
    '1% transitions tracked from first stable observation of P% to first observation of (P+1)%.',
    'No definitive battery degradation or safety claims are asserted; physical inspection recommended for abnormal drops.',
  ];

  return {
    reportId,
    sessionId: session.sessionId,
    batteryId: session.batteryId,
    batteryName: session.batteryName,
    batteryChemistry: session.batteryChemistry,
    batteryCapacity: session.batteryCapacity,
    charger: session.chargerName,
    operator: session.operatorName,
    startTimestamp: session.startTimestamp,
    endTimestamp: session.endTimestamp || session.startTimestamp,
    totalDurationSeconds: session.totalDurationSeconds,
    isDemo: session.isDemo,

    startingPercentage,
    endingPercentage,
    totalPercentageIncrease,
    startingVoltage,
    endingVoltage,
    minimumVoltage,
    maximumVoltage,
    averageVoltage,
    startingCurrent,
    endingCurrent,
    minimumCurrent,
    maximumCurrent,
    averageCurrent,
    averagePower,
    maximumPower,
    totalEnergyWh,
    totalAh,
    totalMah,
    totalSamples,
    averageOcrConfidence: avgConfidence,
    dataQualityScore,

    voltageBehavior,
    currentBehavior,
    powerBehavior,
    chargingSpeed,
    slowChargingRanges,
    fastChargingRanges,
    percentageTransitionConsistency,
    chargingStability,

    warnings,
    abnormalities,
    mainFindings,
    calculationNotes,
  };
}
