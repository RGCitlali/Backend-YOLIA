const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listMeals, addMeal } = require('../controllers/meal.controller');

router.use(authenticate);

router.get('/patients/:patientId/meals', listMeals);
router.post('/patients/:patientId/meals', addMeal);

module.exports = router;
