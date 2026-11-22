const multer = require('multer');
const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

// Límite por archivo (PDF / PNG / JPG). Debe ser menor que max_allowed_packet de MySQL.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 },
}).single('file');

// Detecta el tipo real del archivo por su contenido (no por la extensión).
function detectType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.subarray(0, 1024).includes('%PDF-')) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  return null;
}

function cleanFileName(name, fallbackExt) {
  let n = String(name || '').replace(/[\\/\u0000-\u001f]/g, '_').trim();
  // Multer entrega el nombre en latin1; se reinterpreta como UTF-8 si corresponde.
  const asUtf8 = Buffer.from(n, 'latin1').toString('utf8');
  if (!asUtf8.includes('\ufffd')) n = asUtf8;
  if (!n) n = `documento.${fallbackExt}`;
  return n.slice(0, 200);
}

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

async function listDocuments(req, res) {
  try {
    const { patientId } = req.params;
    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

    // No se selecciona file_data: el archivo se descarga aparte, solo al abrirlo.
    const [rows] = await pool.query(
      `SELECT d.id, d.title, d.document_date, d.requested_by_name, d.description,
              d.file_name, d.mime_type, d.file_size, d.created_at, d.uploaded_by,
              u.full_name AS uploaded_by_name
       FROM patient_documents d
       JOIN users u ON u.id = d.uploaded_by
       WHERE d.patient_id = ?
       ORDER BY d.document_date DESC, d.id DESC`,
      [patientId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function createDocument(req, res) {
  try {
    const { patientId } = req.params;
    if (!['doctor', 'caregiver'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Solo médicos y cuidadores pueden subir documentos' });
    }
    // Se valida el acceso ANTES de procesar el archivo.
    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ error: 'No estás asignado a este paciente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo supera el límite de 15 MB' });
      }
      return res.status(400).json({ error: 'No se pudo procesar el archivo enviado' });
    }

    try {
      const { patientId } = req.params;
      if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });

      const type = detectType(req.file.buffer);
      if (!type) {
        return res.status(400).json({ error: 'Formato no permitido. Usa PDF, PNG o JPG' });
      }

      const title = String(req.body.title || '').trim();
      const documentDate = String(req.body.documentDate || '').trim();
      let requestedByName = String(req.body.requestedByName || '').trim();
      const description = String(req.body.description || '').trim();

      if (!title) return res.status(400).json({ error: 'El nombre del estudio es obligatorio' });
      if (title.length > 150) return res.status(400).json({ error: 'El nombre es demasiado largo (máx. 150)' });
      if (!isValidDate(documentDate)) {
        return res.status(400).json({ error: 'La fecha no es válida (AAAA-MM-DD)' });
      }
      if (requestedByName.length > 150) {
        return res.status(400).json({ error: 'El nombre del médico es demasiado largo (máx. 150)' });
      }
      if (description.length > 500) {
        return res.status(400).json({ error: 'La descripción es demasiado larga (máx. 500)' });
      }

      if (!requestedByName && req.user.role === 'doctor') {
        requestedByName = req.user.fullName || '';
      }

      // execute() envía el archivo en binario; query() lo convertiría a hexadecimal
      // y duplicaría su tamaño.
      const [result] = await pool.execute(
        `INSERT INTO patient_documents
           (patient_id, uploaded_by, title, document_date, requested_by_name, description,
            file_name, mime_type, file_size, file_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patientId,
          req.user.id,
          title,
          documentDate,
          requestedByName || null,
          description || null,
          cleanFileName(req.file.originalname, type.ext),
          type.mime,
          req.file.size,
          req.file.buffer,
        ]
      );

      res.status(201).json({ id: result.insertId, message: 'Documento guardado' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
}

async function downloadDocument(req, res) {
  try {
    const { documentId } = req.params;
    const [rows] = await pool.query(
      `SELECT patient_id, file_name, mime_type, file_data
       FROM patient_documents WHERE id = ?`,
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

    const doc = rows[0];
    const allowed = await userCanAccessPatient(req.user, doc.patient_id);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este documento' });

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Length', doc.file_data.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(doc.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function deleteDocument(req, res) {
  try {
    const { documentId } = req.params;
    const [rows] = await pool.query(
      'SELECT patient_id, uploaded_by FROM patient_documents WHERE id = ?',
      [documentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });

    const doc = rows[0];
    const allowed = await userCanAccessPatient(req.user, doc.patient_id);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso a este documento' });
    if (doc.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo quien subió el documento puede eliminarlo' });
    }

    await pool.query('DELETE FROM patient_documents WHERE id = ?', [documentId]);
    res.json({ message: 'Documento eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listDocuments, createDocument, downloadDocument, deleteDocument };