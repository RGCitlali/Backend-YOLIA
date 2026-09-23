const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

async function selfAssignToPatient(req, res) {
  if (req.user.role !== 'caregiver') {
    return res.status(403).json({ error: 'Solo un cuidador puede autoasignarse' });
  }
  const { patientEmail, relationship } = req.body;
  if (!patientEmail) return res.status(400).json({ error: 'patientEmail es obligatorio' });

  const [patients] = await pool.query(
    `SELECT p.id FROM patients p
     JOIN users u ON u.id = p.user_id
     WHERE u.email = ? AND u.role = 'elderly'`,
    [patientEmail]
  );
  if (!patients.length) {
    return res.status(404).json({ error: 'No existe un paciente registrado con ese correo' });
  }

  await pool.query(
    `INSERT INTO patient_caregivers (patient_id, caregiver_id, relationship, is_primary)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE relationship = VALUES(relationship)`,
    [patients[0].id, req.user.id, relationship || null]
  );

  res.status(201).json({ message: 'Vinculado al paciente', patientId: patients[0].id });
}

async function listMyPatients(req, res) {
  const { role, id } = req.user;

  let rows;
  if (role === 'caregiver') {
    [rows] = await pool.query(
      `SELECT p.id, u.full_name, p.birth_date
       FROM patients p
       JOIN patient_caregivers pc ON pc.patient_id = p.id
       JOIN users u ON u.id = p.user_id
       WHERE pc.caregiver_id = ?`,
      [id]
    );
  } else if (role === 'doctor') {
    [rows] = await pool.query(
      `SELECT p.id, u.full_name, p.birth_date
       FROM patients p
       JOIN patient_doctors pd ON pd.patient_id = p.id
       JOIN users u ON u.id = p.user_id
       WHERE pd.doctor_id = ?`,
      [id]
    );
  } else if (role === 'elderly') {
    [rows] = await pool.query(
      `SELECT p.id, u.full_name, p.birth_date FROM patients p WHERE p.user_id = ?`,
      [id]
    );
  } else {
    rows = [];
  }

  res.json(rows);
}

async function getPatient(req, res) {
  const { patientId } = req.params;
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [rows] = await pool.query(
    `SELECT p.*, u.full_name, u.email, u.phone, u.photo_url
     FROM patients p JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [patientId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json(rows[0]);
}

async function updatePatient(req, res) {
  const { patientId } = req.params;
  if (!['caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Solo el cuidador puede editar el perfil del paciente' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const fields = [
    'birth_date', 'sex', 'blood_type', 'height_cm', 'weight_kg', 'address',
    'emergency_contact_name', 'emergency_contact_phone', 'allergies', 'chronic_conditions',
  ];
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

  values.push(patientId);
  await pool.query(`UPDATE patients SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ message: 'Perfil actualizado' });
}

async function assignCaregiver(req, res) {
  const { patientId } = req.params;
  const { caregiverEmail, relationship, isPrimary } = req.body;

  if (!['caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const [caregivers] = await pool.query(
    "SELECT id FROM users WHERE email = ? AND role = 'caregiver'",
    [caregiverEmail]
  );
  if (!caregivers.length) return res.status(404).json({ error: 'Cuidador no encontrado' });

  await pool.query(
    `INSERT INTO patient_caregivers (patient_id, caregiver_id, relationship, is_primary)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE relationship = VALUES(relationship), is_primary = VALUES(is_primary)`,
    [patientId, caregivers[0].id, relationship || null, isPrimary ? 1 : 0]
  );
  res.status(201).json({ message: 'Cuidador asignado' });
}

async function assignDoctor(req, res) {
  const { patientId } = req.params;
  const { doctorEmail, specialty, isPrimary } = req.body;

  if (!['caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const [doctors] = await pool.query(
    "SELECT id FROM users WHERE email = ? AND role = 'doctor'",
    [doctorEmail]
  );
  if (!doctors.length) return res.status(404).json({ error: 'Doctor no encontrado' });

  await pool.query(
    `INSERT INTO patient_doctors (patient_id, doctor_id, specialty, is_primary)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE specialty = VALUES(specialty), is_primary = VALUES(is_primary)`,
    [patientId, doctors[0].id, specialty || null, isPrimary ? 1 : 0]
  );
  res.status(201).json({ message: 'Doctor asignado' });
}

module.exports = {
  getPatient, updatePatient, assignCaregiver, assignDoctor, listMyPatients,
  selfAssignToPatient,
};
