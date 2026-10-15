// BORRAR ESTO AL TERMINAR LA PRACTICA 
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { searchPatientsByName, searchPatientsByNameSafe } = require('../controllers/search.controller');

router.get('/patients/search', authenticate, searchPatientsByName);
router.get('/patients/search-safe', authenticate, searchPatientsByNameSafe);

module.exports = router;