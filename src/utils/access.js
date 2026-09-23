const pool = require('../config/db');

async function userCanAccessPatient(user, patientId) {
  if (user.role === 'admin') return true;

  if (user.role === 'elderly') {
    const [rows] = await pool.query(
      'SELECT id FROM patients WHERE id = ? AND user_id = ?',
      [patientId, user.id]
    );
    return rows.length > 0;
  }

  if (user.role === 'caregiver') {
    const [rows] = await pool.query(
      'SELECT id FROM patient_caregivers WHERE patient_id = ? AND caregiver_id = ?',
      [patientId, user.id]
    );
    return rows.length > 0;
  }

  if (user.role === 'doctor') {
    const [rows] = await pool.query(
      'SELECT id FROM patient_doctors WHERE patient_id = ? AND doctor_id = ?',
      [patientId, user.id]
    );
    return rows.length > 0;
  }

  return false;
}

module.exports = { userCanAccessPatient };
