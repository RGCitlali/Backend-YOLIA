const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');
const { askInformativeFlow } = require('../services/anthropic.service');
const emergencyKeywords = require('../data/emergency_keywords');

const EMERGENCY_RESPONSE_TEXT =
  'Detecté que podrías estar en una emergencia. Mantén la calma. ' +
  'Ya se avisó a tu cuidador. Si puedes, quédate donde estás y espera ayuda. ';

function detectEmergency(text) {
  const q = text.toLowerCase();
  return emergencyKeywords.some((kw) => q.includes(kw));
}

async function query(req, res) {
  const { patientId } = req.params;
  const { queryText } = req.body;

  if (!['elderly', 'caregiver'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado para usar el asistente' });
  }
  if (!queryText || !queryText.trim()) {
    return res.status(400).json({ error: 'queryText es obligatorio' });
  }

  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const start = Date.now();
  const isEmergency = detectEmergency(queryText);

  try {
    let responseText;
    let flowType;
    let functionCalled = null;
    let tokensUsed = null;

    if (isEmergency) {
      responseText = EMERGENCY_RESPONSE_TEXT;
      flowType = 'emergency';
    } else {
      const result = await askInformativeFlow({ patientId, queryText });
      responseText = result.responseText;
      functionCalled = result.functionCalled;
      tokensUsed = result.tokensUsed;
      flowType = functionCalled ? 'function_call' : 'informative';
    }

    const latencyMs = Date.now() - start;

    await pool.query(
      `INSERT INTO ai_assistant_logs
       (patient_id, spoken_by, flow_type, query_text, response_text, function_called, tokens_used, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientId, req.user.id, flowType, queryText, responseText, functionCalled, tokensUsed, latencyMs]
    );

    res.json({ responseText, flowType, isEmergency, latencyMs });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'No se pudo procesar la solicitud del asistente. Intenta de nuevo.',
    });
  }
}

async function getLogs(req, res) {
  const { patientId } = req.params;

  if (!['caregiver', 'doctor', 'elderly'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const allowed = await userCanAccessPatient(req.user, patientId);
  if (!allowed) return res.status(403).json({ error: 'Sin acceso a este paciente' });

  const [logs] = await pool.query(
    `SELECT l.*, u.full_name AS spoken_by_name
     FROM ai_assistant_logs l JOIN users u ON u.id = l.spoken_by
     WHERE l.patient_id = ? ORDER BY l.created_at ASC`,
    [patientId]
  );
  res.json(logs);
}

module.exports = { query, getLogs };
