const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listMeals, addMeal, deleteMeal } = require('../controllers/meal.controller');

router.use(authenticate);

router.get('/patients/:patientId/meals', listMeals);
router.post('/patients/:patientId/meals', addMeal);
router.delete('/patients/:patientId/meals/:mealId', deleteMeal);

module.exports = router;