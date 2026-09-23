require('dotenv').config();
const pool = require('../config/db');
const knowledgeBase = require('../data/health_knowledge_base');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const TOOLS = [
  {
    name: 'get_medications',
    description:
      'Obtiene la lista de medicamentos activos del paciente, con su dosis y horario. ' +
      'Úsala cuando el usuario pregunte qué medicinas tiene, a qué hora las toma, o si ya ' +
      'le tocaba tomar alguna.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_latest_vitals',
    description:
      'Obtiene la lectura más reciente de signos vitales del paciente (frecuencia ' +
      'cardiaca, oxigenación, temperatura, presión arterial). Úsala cuando el usuario ' +
      'pregunte cómo están sus signos vitales o su presión/oxígeno actual.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

async function executeTool(name, patientId) {
  if (name === 'get_medications') {
    const [meds] = await pool.query(
      `SELECT name, dosage, frequency_hours, instructions
       FROM medications WHERE patient_id = ? AND is_active = 1`,
      [patientId]
    );
    for (const m of meds) {
      const [schedule] = await pool.query(
        `SELECT time_of_day FROM medication_schedule
         WHERE medication_id = (SELECT id FROM medications WHERE patient_id = ? AND name = ? LIMIT 1)`,
        [patientId, m.name]
      );
      m.schedule = schedule.map((s) => s.time_of_day);
    }
    return JSON.stringify(meds);
  }

  if (name === 'get_latest_vitals') {
    const [rows] = await pool.query(
      `SELECT heart_rate, spo2, temperature_c, systolic_bp, diastolic_bp, recorded_at
       FROM vitals_readings WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [patientId]
    );
    return JSON.stringify(rows[0] || { message: 'Sin lecturas registradas todavía' });
  }

  return JSON.stringify({ error: 'Herramienta desconocida' });
}

function retrieveKnowledge(queryText) {
  const q = queryText.toLowerCase();
  const matches = knowledgeBase.filter((entry) =>
    entry.keywords.some((k) => q.includes(k))
  );
  return matches.slice(0, 3).map((m) => m.content);
}

const SYSTEM_PROMPT = `Eres el asistente de salud de YOLIA, hablando por voz con un adulto mayor.

REGLAS ESTRICTAS (no las rompas nunca):
- NUNCA recomiendes un tratamiento, medicamento, dosis o suplemento específico que el
  usuario no esté tomando ya. Si preguntan qué deberían tomar para algo, responde que
  eso lo debe indicar su médico, y ofrécete a explicar información general del tema.
- NUNCA emitas un diagnóstico. Puedes explicar qué significan términos o rangos
  generales, pero no le digas al usuario qué condición médica tiene.
- Si detectas señales de una posible urgencia médica en el mensaje, dilo claramente y
  sugiere contactar a su cuidador o a emergencias de inmediato.
- Usa SIEMPRE las herramientas disponibles para consultar datos reales del paciente
  (medicamentos, signos vitales) en vez de inventar cifras o nombres de medicinas.
- Responde en español, con oraciones cortas y claras, en un tono cálido y paciente,
  como si hablaras con alguien mayor que puede no ser experto en tecnología o medicina.
- Si la base de conocimiento incluida abajo no cubre la pregunta, dilo con honestidad
  y sugiere consultarlo con su médico o cuidador, en vez de inventar una respuesta.
- Se lo más breve y directo posible, un máximo de dos oraciones que puedan ser comprendidas por un adulto mayor.
- Nunca redactes con asteriscos o símbolos, únicamente texto plano en prosa.`;

async function askInformativeFlow({ patientId, queryText }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no está configurada en el backend (.env)');
  }

  const context = retrieveKnowledge(queryText);
  const contextBlock =
    context.length > 0
      ? `\n\nInformación de referencia relevante:\n${context.map((c) => `- ${c}`).join('\n')}`
      : '';

  const messages = [{ role: 'user', content: queryText }];

  let functionCalled = null;
  let finalText = '';
  let totalTokens = 0;

  for (let turn = 0; turn < 3; turn++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 350,
        system: SYSTEM_PROMPT + contextBlock,
        tools: TOOLS,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Error de la API de Claude (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    totalTokens += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use');
    const textBlocks = data.content.filter((b) => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      finalText = textBlocks.map((b) => b.text).join(' ').trim();
      break;
    }

    messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      functionCalled = block.name;
      const result = await executeTool(block.name, patientId);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    responseText: finalText || 'No pude generar una respuesta en este momento. Intenta de nuevo.',
    functionCalled,
    tokensUsed: totalTokens,
  };
}

module.exports = { askInformativeFlow };
