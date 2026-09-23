const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
require('dotenv').config();

async function register(req, res) {
  try {
    const { fullName, email, password, role, phone } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!['admin', 'doctor', 'caregiver', 'elderly'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, passwordHash, role, phone || null]
    );

    const userId = result.insertId;

    if (role === 'elderly') {
      await pool.query('INSERT INTO patients (user_id) VALUES (?)', [userId]);
    }

    return res.status(201).json({ id: userId, fullName, email, role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al registrar usuario' });
  }
}

async function login(req, res) {
  try {
    const { email, password, deviceInfo } = req.body;
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    let patientId = null;
    if (user.role === 'elderly') {
      const [p] = await pool.query('SELECT id FROM patients WHERE user_id = ?', [user.id]);
      patientId = p.length ? p[0].id : null;
    }

    const payload = { id: user.id, role: user.role, fullName: user.full_name, patientId };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30));

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, deviceInfo || null, expiresAt]
    );

    return res.json({ token, refreshToken, user: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al iniciar sesión' });
  }
}

async function me(req, res) {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, phone, photo_url FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
}

module.exports = { register, login, me };
