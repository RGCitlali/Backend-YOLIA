const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const LEVELS = ['green', 'yellow', 'red'];
const SOURCES = ['catalog', 'openfoodfacts', 'manual'];

function numOrNull(v, max) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

async function listMeals(req, res) {
  try {
    const { patientId } = req.params;
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Falta el parámetro date (YYYY-MM-DD)' });
    }

    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) {
      return res.status(403).json({ error: 'No estás asignado a este paciente' });
    }

    const [rows] = await pool.query(
      `SELECT id, meal_type, description, health_level, calories, carbs_g, sugar_g, source, created_at
       FROM meal_logs
       WHERE patient_id = ? AND meal_date = ?
       ORDER BY created_at ASC, id ASC`,
      [patientId, date]
    );

    const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
    rows.forEach((r) => {
      grouped[r.meal_type].push({
        id: r.id,
        description: r.description,
        healthLevel: r.health_level,
        calories: r.calories,
        carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
        sugarG: r.sugar_g === null ? null : Number(r.sugar_g),
        source: r.source,
        createdAt: r.created_at,
      });
    });

    res.json(grouped);
  } catch (err) {
    console.error(err);
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        error: 'Falta actualizar la tabla meal_logs en la base de datos (ejecuta el ALTER TABLE)',
      });
    }
    res.status(500).json({ error: 'Error al obtener las comidas' });
  }
}

async function addMeal(req, res) {
  try {
    const { patientId } = req.params;
    const { mealType, description, date, healthLevel, calories, carbsG, sugarG, source } = req.body;

    if (!MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: 'Tipo de comida inválido' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'Falta la descripción del alimento' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Falta la fecha (YYYY-MM-DD)' });
    }

    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) {
      return res.status(403).json({ error: 'No estás asignado a este paciente' });
    }

    const text = String(description).trim().slice(0, 255);
    const level = LEVELS.includes(healthLevel) ? healthLevel : null;
    const kcal = numOrNull(calories, 20000);
    const src = SOURCES.includes(source) ? source : 'manual';

    const [result] = await pool.query(
      `INSERT INTO meal_logs
         (patient_id, logged_by, meal_type, description, meal_date, health_level, calories, carbs_g, sugar_g, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        req.user.id,
        mealType,
        text,
        date,
        level,
        kcal === null ? null : Math.round(kcal),
        numOrNull(carbsG, 5000),
        numOrNull(sugarG, 5000),
        src,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      mealType,
      description: text,
      healthLevel: level,
    });
  } catch (err) {
    console.error(err);
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        error: 'Falta actualizar la tabla meal_logs en la base de datos (ejecuta el ALTER TABLE)',
      });
    }
    res.status(500).json({ error: 'Error al guardar la comida' });
  }
}

async function deleteMeal(req, res) {
  try {
    const { patientId, mealId } = req.params;

    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) {
      return res.status(403).json({ error: 'No estás asignado a este paciente' });
    }

    const [result] = await pool.query(
      'DELETE FROM meal_logs WHERE id = ? AND patient_id = ?',
      [mealId, patientId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alimento no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el alimento' });
  }
}

module.exports = { listMeals, addMeal, deleteMeal };