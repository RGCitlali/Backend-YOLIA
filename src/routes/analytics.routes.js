const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getSummary } = require('../controllers/analytics.controller');

router.use(authenticate);

router.get('/patients/:patientId/analytics/summary', getSummary);

module.exports = router;
