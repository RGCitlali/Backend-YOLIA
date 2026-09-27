const pool = require('../config/db');
const { userCanAccessPatient } = require('../utils/access');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

async function listMeals(req, res) {
  try {
    const { patientId } = req.params;
    const { date } = req.query; // formato 'YYYY-MM-DD'
    if (!date) {
      return res.status(400).json({ error: 'Falta el parámetro date (YYYY-MM-DD)' });
    }

    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) {
      return res.status(403).json({ error: 'No estás asignado a este paciente' });
    }

    const [rows] = await pool.query(
      `SELECT id, meal_type, description, created_at
       FROM meal_logs
       WHERE patient_id = ? AND meal_date = ?
       ORDER BY created_at ASC`,
      [patientId, date]
    );

    const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
    rows.forEach((r) => {
      grouped[r.meal_type].push({
        id: r.id,
        description: r.description,
        createdAt: r.created_at,
      });
    });

    res.json(grouped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las comidas' });
  }
}

async function addMeal(req, res) {
  try {
    const { patientId } = req.params;
    const { mealType, description, date } = req.body;

    if (!MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: 'Tipo de comida inválido' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Falta la descripción del alimento' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Falta la fecha (YYYY-MM-DD)' });
    }

    const allowed = await userCanAccessPatient(req.user, patientId);
    if (!allowed) {
      return res.status(403).json({ error: 'No estás asignado a este paciente' });
    }

    const [result] = await pool.query(
      `INSERT INTO meal_logs (patient_id, logged_by, meal_type, description, meal_date)
       VALUES (?, ?, ?, ?, ?)`,
      [patientId, req.user.id, mealType, description.trim(), date]
    );

    res.status(201).json({
      id: result.insertId,
      mealType,
      description: description.trim(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la comida' });
  }
}

module.exports = { listMeals, addMeal };
