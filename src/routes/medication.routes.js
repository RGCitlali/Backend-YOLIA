const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listMedications, createMedication, updateMedication, logIntake, getIntakeLog,
} = require('../controllers/medication.controller');

router.use(authenticate);

router.get('/patients/:patientId/medications', listMedications);
router.post('/patients/:patientId/medications', createMedication);

router.put('/medications/:medicationId', updateMedication);
router.post('/medications/:medicationId/intake', logIntake);
router.get('/medications/:medicationId/intake', getIntakeLog);

module.exports = router;
