// BORRAR ESTO AL TERMINAR LA PRACTICA 
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { searchPatientsByName, searchPatientsByNameSafe } = require('../controllers/search.controller');

router.use(authenticate);
router.get('/patients/search', searchPatientsByName);
router.get('/patients/search-safe', searchPatientsByNameSafe);

module.exports = router;