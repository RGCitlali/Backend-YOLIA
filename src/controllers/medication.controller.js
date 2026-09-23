const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

async function listMedications(req, res) {
  const { patientId } = req.params;
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [meds] = await pool.query(
    `SELECT m.*, u.full_name AS prescribed_by_name
     FROM medications m JOIN users u ON u.id = m.prescribed_by
     WHERE m.patient_id = ? AND m.is_active = 1
     ORDER BY m.created_at DESC`,
    [patientId]
  );

  for (const med of meds) {
    const [schedule] = await pool.query(
      'SELECT time_of_day FROM medication_schedule WHERE medication_id = ?',
      [med.id]
    );
    med.schedule = schedule.map((s) => s.time_of_day);
  }

  res.json(meds);
}

async function createMedication(req, res) {
  const { patientId } = req.params;
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Solo un médico puede añadir medicamentos' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'No estás asignado a este paciente' });

  const { name, dosage, frequencyHours, instructions, startDate, endDate, schedule } = req.body;
  if (!name || !dosage || !startDate) {
    return res.status(400).json({ error: 'Nombre, dosis y fecha de inicio son obligatorios' });
  }

  const [result] = await pool.query(
    `INSERT INTO medications
     (patient_id, prescribed_by, name, dosage, frequency_hours, instructions, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, req.user.id, name, dosage, frequencyHours || null, instructions || null, startDate, endDate || null]
  );

  const medicationId = result.insertId;
  if (Array.isArray(schedule)) {
    for (const time of schedule) {
      await pool.query(
        'INSERT INTO medication_schedule (medication_id, time_of_day) VALUES (?, ?)',
        [medicationId, time]
      );
    }
  }

  res.status(201).json({ id: medicationId, message: 'Medicamento añadido' });
}

async function updateMedication(req, res) {
  const { medicationId } = req.params;
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Solo un médico puede modificar medicamentos' });
  }

  const [meds] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  if (!meds.length) return res.status(404).json({ error: 'Medicamento no encontrado' });

  const allowed = await userCanAccessPatient(req.user, meds[0].patient_id);
  if (!allowed) return res.status(403).json({ error: 'No estás asignado a este paciente' });

  const fields = ['name', 'dosage', 'frequency_hours', 'instructions', 'start_date', 'end_date', 'is_active'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[camel]);
    }
  }
  if (updates.length) {
    values.push(medicationId);
    await pool.query(`UPDATE medications SET ${updates.join(', ')} WHERE id = ?`, values);
  }

  res.json({ message: 'Medicamento actualizado' });
}

async function logIntake(req, res) {
  const { medicationId } = req.params;
  const { scheduledFor, taken } = req.body;

  if (!['elderly', 'caregiver'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado para registrar tomas' });
  }
  if (!scheduledFor || taken === undefined) {
    return res.status(400).json({ error: 'scheduledFor y taken son obligatorios' });
  }

  const [meds] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  if (!meds.length) return res.status(404).json({ error: 'Medicamento no encontrado' });

  const allowed = await userCanAccessPatient(req.user, meds[0].patient_id);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  await pool.query(
    `INSERT INTO medication_intake_log (medication_id, scheduled_for, taken, taken_at, marked_by)
     VALUES (?, ?, ?, ?, ?)`,
    [medicationId, scheduledFor, taken ? 1 : 0, taken ? new Date() : null, req.user.id]
  );

  res.status(201).json({ message: 'Toma registrada' });
}

async function getIntakeLog(req, res) {
  const { medicationId } = req.params;
  const [meds] = await pool.query('SELECT * FROM medications WHERE id = ?', [medicationId]);
  if (!meds.length) return res.status(404).json({ error: 'Medicamento no encontrado' });

  const allowed = await userCanAccessPatient(req.user, meds[0].patient_id);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [logs] = await pool.query(
    `SELECT l.*, u.full_name AS marked_by_name
     FROM medication_intake_log l JOIN users u ON u.id = l.marked_by
     WHERE l.medication_id = ? ORDER BY l.scheduled_for DESC`,
    [medicationId]
  );
  res.json(logs);
}

module.exports = { listMedications, createMedication, updateMedication, logIntake, getIntakeLog };
