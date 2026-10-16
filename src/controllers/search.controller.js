// BORRAR ESTO AL TERMINAR LA PRACTICA 
const pool = require('../config/db');

async function searchPatientsByName(req, res) {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name es obligatorio' });

  const sql = `SELECT u.id, u.full_name, u.email, u.phone, p.address
               FROM users u JOIN patients p ON p.user_id = u.id
               WHERE u.role = 'elderly' AND u.full_name LIKE '%${name}%'`;

  try {
    const [rows] = await pool.query(sql);
    res.json({ sql, rows });
  } catch (err) {
    res.status(500).json({ error: err.message, sql });
  }
}

async function searchPatientsByNameSafe(req, res) {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name es obligatorio' });

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name
       FROM users u JOIN patients p ON p.user_id = u.id
       WHERE u.role = 'elderly' AND u.full_name LIKE CONCAT('%', ?, '%')`,
      [name]
    );
    res.json({ count: rows.length, patients: rows });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la búsqueda' });
  }
}

module.exports = { searchPatientsByName, searchPatientsByNameSafe };