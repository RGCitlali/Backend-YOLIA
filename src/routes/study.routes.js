const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listStudies, createStudy, updateStudy } = require('../controllers/study.controller');

router.use(authenticate);

router.get('/patients/:patientId/studies', listStudies);
router.post('/patients/:patientId/studies', createStudy);
router.put('/studies/:studyId', updateStudy);

module.exports = router;
