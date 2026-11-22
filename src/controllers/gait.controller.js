const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

const MIN_SPEED = 0.05; // m/s
const MAX_SPEED = 3.0;  // m/s

// Lecturas de velocidad de marcha (m/s) de un paciente, de la más antigua a la más reciente.
// La app agrupa por día, semana o mes usando la hora local del dispositivo.
async function listGait(req, res) {
  try {
    const { patientId } = req.params;
    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

    const days = Math.min(Math.max(parseInt(req.query.days) || 190, 1), 400);
    try {
      const [rows] = await pool.query(
        `SELECT id, speed_ms, source, recorded_at
         FROM gait_readings
         WHERE patient_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY recorded_at ASC
         LIMIT 5000`,
        [patientId, days]
      );
      res.json(rows);
    } catch (err) {
      // Si la tabla aún no existe, la app simplemente muestra "sin registros".
      if (err.code === 'ER_NO_SUCH_TABLE') return res.json([]);
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function addGait(req, res) {
  try {
    const { patientId } = req.params;
    if (!['caregiver', 'elderly', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

    const speed = Number(req.body.speedMs);
    if (!Number.isFinite(speed) || speed < MIN_SPEED || speed > MAX_SPEED) {
      return res.status(400).json({ error: 'La velocidad debe estar entre 0.05 y 3.00 m/s' });
    }

    // Se respeta la hora local enviada por la app ("2026-11-22T13:05:00"); si no viene, se usa NOW().
    let recordedAt = null;
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(String(req.body.recordedAt || ''));
    if (m) recordedAt = `${m[1]} ${m[2]}`;

    await pool.query(
      `INSERT INTO gait_readings (patient_id, speed_ms, source, recorded_at)
       VALUES (?, ?, 'manual', COALESCE(?, NOW()))`,
      [patientId, Math.round(speed * 100) / 100, recordedAt]
    );
    res.status(201).json({ message: 'Velocidad de marcha registrada' });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'Falta crear la tabla gait_readings en la base de datos' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listGait, addGait };