// Get summary for specific expense
router.get('/expenses/:id/summary', summaryController.getExpenseSummary);

// Update payment status
router.put('/transactions/:transaction_id/payment-status', summaryController.updatePaymentStatus);

// Get expenses with payment status
router.get('/expenses/with-status', summaryController.getExpensesWithStatus); 