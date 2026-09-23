const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

async function listStudies(req, res) {
  const { patientId } = req.params;
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [studies] = await pool.query(
    `SELECT s.*, u.full_name AS requested_by_name
     FROM medical_studies s JOIN users u ON u.id = s.requested_by
     WHERE s.patient_id = ? ORDER BY s.study_date DESC`,
    [patientId]
  );
  res.json(studies);
}

async function createStudy(req, res) {
  const { patientId } = req.params;
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Solo un médico puede añadir estudios médicos' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'No estás asignado a este paciente' });

  const { studyType, studyDate, results, fileUrl, notes } = req.body;
  if (!studyType || !studyDate) {
    return res.status(400).json({ error: 'studyType y studyDate son obligatorios' });
  }

  const [result] = await pool.query(
    `INSERT INTO medical_studies (patient_id, requested_by, study_type, study_date, results, file_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [patientId, req.user.id, studyType, studyDate, results || null, fileUrl || null, notes || null]
  );

  res.status(201).json({ id: result.insertId, message: 'Estudio médico añadido' });
}

async function updateStudy(req, res) {
  const { studyId } = req.params;
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Solo un médico puede modificar estudios médicos' });
  }

  const [studies] = await pool.query('SELECT * FROM medical_studies WHERE id = ?', [studyId]);
  if (!studies.length) return res.status(404).json({ error: 'Estudio no encontrado' });

  const allowed = await userCanAccessPatient(req.user, studies[0].patient_id);
  if (!allowed) return res.status(403).json({ error: 'No estás asignado a este paciente' });

  const fields = ['study_type', 'study_date', 'results', 'file_url', 'notes'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[camel]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });

  values.push(studyId);
  await pool.query(`UPDATE medical_studies SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ message: 'Estudio actualizado' });
}

module.exports = { listStudies, createStudy, updateStudy };
