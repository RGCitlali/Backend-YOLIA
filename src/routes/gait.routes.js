const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listGait, addGait } = require('../controllers/gait.controller');

router.get('/patients/:patientId/gait', authenticate, listGait);
router.post('/patients/:patientId/gait', authenticate, addGait);

module.exports = router;