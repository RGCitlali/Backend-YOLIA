const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, getLogs } = require('../controllers/assistant.controller');

router.use(authenticate);

router.post('/patients/:patientId/assistant/query', query);
router.get('/patients/:patientId/assistant/logs', getLogs);

module.exports = router;
