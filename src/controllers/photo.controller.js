const multer = require('multer');
const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

// La app reduce la foto antes de enviarla (≈600 px), por lo que 3 MB es un límite holgado.
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 5 },
}).single('photo');

// Detecta el formato real por su contenido: JPEG, PNG o WebP.
function detectImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function sendPhoto(res, userId) {
  const [rows] = await pool.query(
    'SELECT mime_type, data FROM user_photos WHERE user_id = ?',
    [userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Sin foto de perfil' });

  res.setHeader('Content-Type', rows[0].mime_type);
  res.setHeader('Content-Length', rows[0].data.length);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(rows[0].data);
}

function savePhoto(req, res, targetUserId) {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'La foto supera el límite de 3 MB' });
      }
      return res.status(400).json({ error: 'No se pudo procesar la foto enviada' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Falta la foto' });
      const mime = detectImage(req.file.buffer);
      if (!mime) {
        return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG o WebP' });
      }
      await pool.execute(
        `INSERT INTO user_photos (user_id, mime_type, data) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), data = VALUES(data),
                                 updated_at = CURRENT_TIMESTAMP`,
        [targetUserId, mime, req.file.buffer]
      );
      res.json({ message: 'Foto actualizada' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
}

// Foto del usuario en sesión (médico, cuidador o paciente).
async function getMyPhoto(req, res) {
  try {
    await sendPhoto(res, req.user.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

function setMyPhoto(req, res) {
  savePhoto(req, res, req.user.id);
}

// Devuelve el usuario dueño del paciente, validando que quien pregunta tenga acceso.
async function resolvePatientUser(req, res) {
  const { patientId } = req.params;
  const [rows] = await pool.query('SELECT user_id FROM patients WHERE id = ?', [patientId]);
  if (!rows.length) {
    res.status(404).json({ error: 'Paciente no encontrado' });
    return null;
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) {
    res.status(403).json({ error: 'Sin acceso a este paciente' });
    return null;
  }
  return rows[0].user_id;
}

async function getPatientPhoto(req, res) {
  try {
    const userId = await resolvePatientUser(req, res);
    if (userId === null) return;
    await sendPhoto(res, userId);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// Foto de un médico que atiende al paciente (solo si quien pregunta tiene acceso al paciente).
async function getPatientDoctorPhoto(req, res) {
  try {
    const { patientId, doctorId } = req.params;
    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

    const [link] = await pool.query(
      'SELECT id FROM patient_doctors WHERE patient_id = ? AND doctor_id = ?',
      [patientId, doctorId]
    );
    if (!link.length) return res.status(404).json({ error: 'Médico no asignado a este paciente' });

    await sendPhoto(res, doctorId);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function setPatientPhoto(req, res) {
  try {
    // Pueden cambiarla el cuidador vinculado y el propio paciente (o un administrador).
    if (!['caregiver', 'elderly', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para cambiar esta foto' });
    }
    const userId = await resolvePatientUser(req, res);
    if (userId === null) return;
    savePhoto(req, res, userId);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = {
  getMyPhoto, setMyPhoto, getPatientPhoto, setPatientPhoto, getPatientDoctorPhoto,
};