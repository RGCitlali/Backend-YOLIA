const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

async function listVitals(req, res) {
  const { patientId } = req.params;
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const [rows] = await pool.query(
    'SELECT * FROM vitals_readings WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT ?',
    [patientId, limit]
  );
  res.json(rows);
}

async function addVitals(req, res) {
  const { patientId } = req.params;
  if (!['caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const { heartRate, spo2, temperatureC, systolicBp, diastolicBp, recordedAt } = req.body;
  await pool.query(
    `INSERT INTO vitals_readings
     (patient_id, heart_rate, spo2, temperature_c, systolic_bp, diastolic_bp, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
    [patientId, heartRate || null, spo2 || null, temperatureC || null, systolicBp || null, diastolicBp || null,
      recordedAt || new Date()]
  );
  res.status(201).json({ message: 'Lectura registrada' });
}

async function listFallEvents(req, res) {
  const { patientId } = req.params;
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [rows] = await pool.query(
    'SELECT * FROM fall_events WHERE patient_id = ? ORDER BY detected_at DESC',
    [patientId]
  );
  res.json(rows);
}

async function resolveFallEvent(req, res) {
  const { eventId } = req.params;
  const { status, notes } = req.body;

  const [events] = await pool.query('SELECT * FROM fall_events WHERE id = ?', [eventId]);
  if (!events.length) return res.status(404).json({ error: 'Evento no encontrado' });

  const allowed = await userCanAccessPatient(req.user, events[0].patient_id);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  await pool.query(
    `UPDATE fall_events SET status = ?, notes = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?`,
    [status, notes || null, req.user.id, eventId]
  );
  res.json({ message: 'Evento actualizado' });
}

async function reportFall(req, res) {
  const { patientId } = req.params;
  const { severity, notes, source } = req.body;

  if (!['elderly', 'caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [result] = await pool.query(
    `INSERT INTO fall_events (patient_id, device_id, detected_at, severity, status, notes)
     VALUES (?, NULL, NOW(), ?, 'pending', ?)`,
    [
      patientId,
      severity || 'medium',
      notes || (source === 'simulated'
        ? 'Reportada con el botón de simulación desde la app'
        : 'Reportada manualmente desde la app'),
    ]
  );

  res.status(201).json({ id: result.insertId, message: 'Caída registrada' });
}

module.exports = { listVitals, addVitals, listFallEvents, resolveFallEvent, reportFall };
