const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');

// GET summary data
router.get('/', summaryController.getSummary);

// GET summary for a specific expense
router.get('/expense/:expenseId', summaryController.getExpenseSummary);

// GET all expenses with payment status
router.get('/expenses-with-status', summaryController.getExpensesWithStatus);

// GET transactions grouped by expenses
router.get('/expenses-transactions', summaryController.getExpensesTransactions);

// Update payment status
router.post('/payment/:paymentId', summaryController.updatePaymentStatus);

module.exports = router; 