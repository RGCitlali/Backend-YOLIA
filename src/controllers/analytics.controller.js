const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

// ------------------------------------------------------------------
// Analítica descriptiva basada en reglas (NO es machine learning ni
// predicción de IA — es honesto llamarla así). Calcula estadísticas
// reales a partir de lo que hay en la base de datos y aplica umbrales
// clínicos generales para marcar cada indicador como normal o de
// atención. Es la base sobre la que después se puede construir un
// modelo de analítica avanzada (ver README_ANALITICA.md para el plan
// de evolución hacia un modelo dimensional tipo copo de nieve).
//
// NOTA: no se usa hrv_ms (variabilidad de la frecuencia cardiaca) en
// ningún cálculo — no hay ningún sensor en este proyecto que la mida
// todavía, así que incluirla habría sido mostrar un dato inventado.
// ------------------------------------------------------------------

const THRESHOLDS = {
  heartRateLow: 50,
  heartRateHigh: 120,
  spo2Low: 92,
  systolicHigh: 140,
  systolicLow: 90,
  temperatureFever: 37.5,
  adherenceWarning: 80, // % por debajo del cual se marca como atención
};

function trendDirection(recent, prior) {
  if (recent == null || prior == null) return 'unknown';
  const diff = recent - prior;
  if (Math.abs(diff) < 0.5) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

async function getSummary(req, res) {
  const { patientId } = req.params;

  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  // ---------- 1. Adherencia a medicamentos (últimos 30 días) ----------
  const [medRows] = await pool.query(
    `SELECT m.id, m.name,
       SUM(CASE WHEN l.taken = 1 THEN 1 ELSE 0 END) AS taken_count,
       COUNT(l.id) AS total_count
     FROM medications m
     LEFT JOIN medication_intake_log l
       ON l.medication_id = m.id AND l.scheduled_for >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     WHERE m.patient_id = ? AND m.is_active = 1
     GROUP BY m.id, m.name`,
    [patientId]
  );

  const medicationAdherence = medRows.map((m) => ({
    medicationId: m.id,
    medicationName: m.name,
    takenCount: m.taken_count,
    totalCount: m.total_count,
    adherencePercent: m.total_count > 0 ? Math.round((m.taken_count / m.total_count) * 100) : null,
  }));

  // ---------- 2. Tendencias de signos vitales (7 días vs 7 días previos) ----------
  const [[vitalsRow]] = await pool.query(
    `SELECT
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN heart_rate END) AS hr_recent,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                 AND recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN heart_rate END) AS hr_prior,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN spo2 END) AS spo2_recent,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                 AND recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN spo2 END) AS spo2_prior,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN systolic_bp END) AS sys_recent,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                 AND recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN systolic_bp END) AS sys_prior,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN temperature_c END) AS temp_recent,
       AVG(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                 AND recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN temperature_c END) AS temp_prior,
       COUNT(CASE WHEN recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                   AND temperature_c >= ? THEN 1 END) AS fever_episodes
     FROM vitals_readings WHERE patient_id = ?`,
    [THRESHOLDS.temperatureFever, patientId]
  );

  const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

  const vitalsTrends = [
    {
      metric: 'heart_rate',
      label: 'Frecuencia cardiaca',
      recentAvg: round1(vitalsRow.hr_recent),
      priorAvg: round1(vitalsRow.hr_prior),
      direction: trendDirection(vitalsRow.hr_recent, vitalsRow.hr_prior),
      flag: vitalsRow.hr_recent != null &&
        (vitalsRow.hr_recent < THRESHOLDS.heartRateLow || vitalsRow.hr_recent > THRESHOLDS.heartRateHigh)
        ? 'warning' : 'normal',
    },
    {
      metric: 'spo2',
      label: 'Oxigenación (SpO₂)',
      recentAvg: round1(vitalsRow.spo2_recent),
      priorAvg: round1(vitalsRow.spo2_prior),
      direction: trendDirection(vitalsRow.spo2_recent, vitalsRow.spo2_prior),
      flag: vitalsRow.spo2_recent != null && vitalsRow.spo2_recent < THRESHOLDS.spo2Low
        ? 'warning' : 'normal',
    },
    {
      metric: 'systolic_bp',
      label: 'Presión sistólica',
      recentAvg: round1(vitalsRow.sys_recent),
      priorAvg: round1(vitalsRow.sys_prior),
      direction: trendDirection(vitalsRow.sys_recent, vitalsRow.sys_prior),
      flag: vitalsRow.sys_recent != null &&
        (vitalsRow.sys_recent > THRESHOLDS.systolicHigh || vitalsRow.sys_recent < THRESHOLDS.systolicLow)
        ? 'warning' : 'normal',
    },
    {
      metric: 'temperature',
      label: 'Temperatura',
      recentAvg: round1(vitalsRow.temp_recent),
      priorAvg: round1(vitalsRow.temp_prior),
      direction: trendDirection(vitalsRow.temp_recent, vitalsRow.temp_prior),
      flag: vitalsRow.temp_recent != null && vitalsRow.temp_recent >= THRESHOLDS.temperatureFever
        ? 'warning' : 'normal',
    },
  ];

  // ---------- 3. Caídas (últimos 30 días vs 30 días previos) ----------
  const [[fallsRow]] = await pool.query(
    `SELECT
       SUM(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS last30,
       SUM(CASE WHEN detected_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                 AND detected_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS prior30
     FROM fall_events WHERE patient_id = ?`,
    [patientId]
  );

  const fallsSummary = {
    last30Days: fallsRow.last30 || 0,
    previous30Days: fallsRow.prior30 || 0,
    increased: (fallsRow.last30 || 0) > (fallsRow.prior30 || 0),
  };

  // ---------- 4. Nivel de riesgo global (conteo simple de banderas) ----------
  let riskPoints = 0;
  vitalsTrends.forEach((v) => { if (v.flag === 'warning') riskPoints++; });
  if (fallsSummary.last30Days > 0) riskPoints++;
  if (vitalsRow.fever_episodes > 0) riskPoints++;
  medicationAdherence.forEach((m) => {
    if (m.adherencePercent != null && m.adherencePercent < THRESHOLDS.adherenceWarning) riskPoints++;
  });

  const overallRiskLevel = riskPoints === 0 ? 'low' : riskPoints <= 2 ? 'moderate' : 'high';

  res.json({
    medicationAdherence,
    vitalsTrends,
    fallsSummary,
    feverEpisodesLast7Days: vitalsRow.fever_episodes || 0,
    overallRiskLevel,
    riskPoints,
    thresholds: THRESHOLDS,
    generatedAt: new Date().toISOString(),
  });
}

module.exports = { getSummary };
