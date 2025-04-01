const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');

// GET all expenses
router.get('/', expenseController.getAllExpenses);

// GET single expense
router.get('/:id', expenseController.getExpenseById);

// POST new expense
router.post('/', expenseController.createExpense);

// PUT update expense
router.put('/:id', expenseController.updateExpense);

// DELETE expense
router.delete('/:id', expenseController.deleteExpense);

module.exports = router; 