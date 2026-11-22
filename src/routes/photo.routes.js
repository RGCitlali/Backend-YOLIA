const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getMyPhoto, setMyPhoto, getPatientPhoto, setPatientPhoto,
} = require('../controllers/photo.controller');

// La autenticación se aplica ruta por ruta para no interceptar otros routers.
router.get('/users/me/photo', authenticate, getMyPhoto);
router.put('/users/me/photo', authenticate, setMyPhoto);
router.get('/patients/:patientId/photo', authenticate, getPatientPhoto);
router.put('/patients/:patientId/photo', authenticate, setPatientPhoto);

module.exports = router;