const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

async function registerDevice(req, res) {
  const { patientId } = req.params;
  const { macAddress, deviceType } = req.body;
  if (!['caregiver', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  if (!macAddress) return res.status(400).json({ error: 'macAddress es obligatoria' });

  await pool.query(
    `INSERT INTO devices (patient_id, device_type, mac_address, status)
     VALUES (?, ?, ?, 'offline')
     ON DUPLICATE KEY UPDATE patient_id = VALUES(patient_id)`,
    [patientId, deviceType || 'ESP32', macAddress]
  );
  res.status(201).json({ message: 'Dispositivo registrado' });
}

async function ingestFromDevice(req, res) {
  const { macAddress, heartRate, spo2, temperatureC, fallDetected, severity } = req.body;
  if (!macAddress) return res.status(400).json({ error: 'macAddress es obligatoria' });

  const [devices] = await pool.query('SELECT * FROM devices WHERE mac_address = ?', [macAddress]);
  if (!devices.length) return res.status(404).json({ error: 'Dispositivo no registrado' });
  const device = devices[0];

  await pool.query('UPDATE devices SET last_seen_at = NOW(), status = "online" WHERE id = ?', [device.id]);

  if (heartRate || spo2 || temperatureC) {
    await pool.query(
      `INSERT INTO vitals_readings (patient_id, heart_rate, spo2, temperature_c, source, recorded_at)
       VALUES (?, ?, ?, ?, 'sensor', NOW())`,
      [device.patient_id, heartRate || null, spo2 || null, temperatureC || null]
    );
  }

  if (fallDetected) {
    await pool.query(
      `INSERT INTO fall_events (patient_id, device_id, detected_at, severity, status)
       VALUES (?, ?, NOW(), ?, 'pending')`,
      [device.patient_id, device.id, severity || 'medium']
    );
  }

  res.status(201).json({ message: 'Datos recibidos' });
}

async function ingestFromPhoneBridge(req, res) {
  const { patientId } = req.params;
  const {
    macAddress, accelerationG, angleX, angleY, isFall, eventType,
    heartRate, spo2, temperatureC,
  } = req.body;

  if (!['caregiver', 'elderly', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  if (!macAddress) return res.status(400).json({ error: 'macAddress es obligatoria' });

  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [devices] = await pool.query(
    'SELECT * FROM devices WHERE mac_address = ? AND patient_id = ?',
    [macAddress, patientId]
  );
  if (!devices.length) {
    return res.status(404).json({
      error: 'Este dispositivo no está vinculado a este paciente. Vincúlalo primero.',
    });
  }
  const device = devices[0];

  await pool.query('UPDATE devices SET last_seen_at = NOW(), status = "online" WHERE id = ?', [
    device.id,
  ]);

  let fallRegistered = false;
  if (isFall) {
    const severity = accelerationG && accelerationG >= 3.0 ? 'high' : 'medium';
    await pool.query(
      `INSERT INTO fall_events (patient_id, device_id, detected_at, severity, status, notes)
       VALUES (?, ?, NOW(), ?, 'pending', ?)`,
      [
        patientId,
        device.id,
        severity,
        `Detectado por sensor BLE. Aceleración: ${accelerationG ?? '—'}G, ` +
          `ángulo X: ${angleX ?? '—'}°, ángulo Y: ${angleY ?? '—'}°, tipo: ${eventType ?? '—'}.`,
      ]
    );
    fallRegistered = true;
  }

  let vitalsSaved = false;
  if (heartRate || spo2 || temperatureC) {
    await pool.query(
      `INSERT INTO vitals_readings
       (patient_id, heart_rate, spo2, temperature_c, source, recorded_at)
       VALUES (?, ?, ?, ?, 'sensor', NOW())`,
      [patientId, heartRate || null, spo2 || null, temperatureC || null]
    );
    vitalsSaved = true;
  }

  res.status(201).json({ message: 'Datos recibidos', fallRegistered, vitalsSaved });
}

module.exports = { registerDevice, ingestFromDevice, ingestFromPhoneBridge };
