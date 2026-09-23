const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getPatient, updatePatient, assignCaregiver, assignDoctor, listMyPatients,
  selfAssignToPatient,
} = require('../controllers/patient.controller');

router.use(authenticate);
router.get('/mine', listMyPatients);
router.post('/self-assign', selfAssignToPatient);

router.get('/:patientId', getPatient);
router.put('/:patientId', updatePatient);
router.post('/:patientId/caregivers', assignCaregiver);
router.post('/:patientId/doctors', assignDoctor);

module.exports = router;
