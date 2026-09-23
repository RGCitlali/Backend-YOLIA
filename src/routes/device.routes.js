const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  registerDevice, ingestFromDevice, ingestFromPhoneBridge,
} = require('../controllers/device.controller');

router.post('/patients/:patientId/devices', authenticate, registerDevice);
router.post('/patients/:patientId/devices/telemetry', authenticate, ingestFromPhoneBridge);
router.post('/devices/ingest', ingestFromDevice);

module.exports = router;
