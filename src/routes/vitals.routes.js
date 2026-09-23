const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listVitals, addVitals, listFallEvents, resolveFallEvent, reportFall,
} = require('../controllers/vitals.controller');

router.use(authenticate);

router.get('/patients/:patientId/vitals', listVitals);
router.post('/patients/:patientId/vitals', addVitals);

router.get('/patients/:patientId/falls', listFallEvents);
router.post('/patients/:patientId/falls', reportFall);
router.put('/falls/:eventId', resolveFallEvent);

module.exports = router;
