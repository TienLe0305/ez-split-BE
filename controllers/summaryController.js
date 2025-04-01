const supabase = require('../utils/supabase');

// Get expense summary and calculations
exports.getSummary = async (req, res) => {
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, bank_account, bank_name')
      .order('id');
    
    if (usersError) throw usersError;
    
    // Get all expenses with payer info
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(`
        id,
        name,
        amount,
        payer_id
      `);
    
    if (expensesError) throw expensesError;
    
    // Get all participants
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        expense_id,
        user_id,
        amount
      `);
    
    if (participantsError) throw participantsError;
    
    // Get all payment statuses
    const { data: paymentStatuses, error: paymentStatusesError } = await supabase
      .from('transaction_payment_status')
      .select('*');
    
    if (paymentStatusesError) throw paymentStatusesError;
    
    // Create a map of payment statuses by transaction ID
    const paymentStatusMap = paymentStatuses.reduce((acc, status) => {
      acc[status.transaction_id] = status;
      return acc;
    }, {});
    
    // Create user summary map - initialize with all users
    const userSummary = users.reduce((acc, user) => {
      acc[user.id] = {
        id: user.id,
        name: user.name,
        paid: 0,         // Total amount paid
        spent: 0,        // Total amount spent
        balance: 0,      // Net balance (paid - spent)
        received: 0,     // Amount received from others (completed payments)
        pending: 0,      // Amount pending to be received (incomplete payments)
        bank_account: user.bank_account,
        bank_name: user.bank_name
      };
      return acc;
    }, {});
    
    // Create a map of expenses
    const expenseMap = expenses.reduce((acc, expense) => {
      acc[expense.id] = expense;
      return acc;
    }, {});
    
    // Map to track which expenses each user owes money for
    const userExpensesMap = {};
    users.forEach(user => {
      userExpensesMap[user.id] = new Set();
    });
    
    // Process all expenses
    expenses.forEach(expense => {
      // Add to payer's total paid amount
      if (userSummary[expense.payer_id]) {
        userSummary[expense.payer_id].paid += parseFloat(expense.amount);
      }
    });
    
    // Process all participants
    participants.forEach(participant => {
      // Add to participant's total spent amount
      if (userSummary[participant.user_id]) {
        userSummary[participant.user_id].spent += parseFloat(participant.amount);
        // Add expense to user's expense list
        if (userExpensesMap[participant.user_id]) {
          userExpensesMap[participant.user_id].add(participant.expense_id);
        }
      }
    });
    
    // Create a map of payment transactions for tracking
    const paymentTransactionsMap = {};
    
    // For each expense, create payment transactions between participants and payer
    expenses.forEach(expense => {
      const expParticipants = participants.filter(p => p.expense_id === expense.id);
      
      expParticipants.forEach(participant => {
        // Skip if participant is the payer
        if (participant.user_id === expense.payer_id) return;
        
        // Generate transaction ID
        const transactionId = `${expense.id}-${participant.user_id}-${expense.payer_id}`;
        
        // Store transaction details
        paymentTransactionsMap[transactionId] = {
          from: participant.user_id,
          to: expense.payer_id,
          amount: parseFloat(participant.amount),
          paid: paymentStatusMap[transactionId]?.paid || false
        };
      });
    });
    
    // Update received and pending amounts based on payment transactions
    Object.values(paymentTransactionsMap).forEach(transaction => {
      // Add to receiver's received amount if paid
      if (transaction.paid && userSummary[transaction.to]) {
        userSummary[transaction.to].received += transaction.amount;
      }
      
      // Add to receiver's pending amount if not paid
      if (!transaction.paid && userSummary[transaction.to]) {
        userSummary[transaction.to].pending += transaction.amount;
      }
    });
    
    // Calculate balance for each user
    Object.values(userSummary).forEach(user => {
      user.balance = user.paid - user.spent;
      // Convert all amounts to 2 decimal places
      user.paid = parseFloat(user.paid.toFixed(2));
      user.spent = parseFloat(user.spent.toFixed(2));
      user.balance = parseFloat(user.balance.toFixed(2));
      user.received = parseFloat(user.received.toFixed(2));
      user.pending = parseFloat(user.pending.toFixed(2));
    });
    
    // Calculate transactions to settle debts
    const transactions = calculateTransactions(Object.values(userSummary), userExpensesMap, expenseMap);
    
    // Attach payment status to each transaction
    transactions.forEach(transaction => {
      // For overall transactions, we need to create a unique ID
      // We'll use format: "overall-{fromId}-{toId}"
      const transactionId = `overall-${transaction.from}-${transaction.to}`;
      
      // Check if payment status exists
      transaction.payment_status = paymentStatusMap[transactionId] || {
        transaction_id: transactionId,
        paid: false,
        paid_at: null
      };
    });
    
    // Return summary data
    res.status(200).json({
      userSummary: Object.values(userSummary),
      transactions
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ 
      message: 'Error generating summary', 
      error: error.message 
    });
  }
};

// Helper function to calculate transactions to settle debts
function calculateTransactions(users, userExpensesMap, expenseMap) {
  // Clone users array to avoid modifying the original
  const usersCopy = JSON.parse(JSON.stringify(users));
  
  // Create a map of users for easy lookup
  const userMap = usersCopy.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
  
  // Separate users with debt (negative balance) and credit (positive balance)
  const debtors = usersCopy.filter(user => user.balance < 0)
    .sort((a, b) => a.balance - b.balance); // Sort by balance (most negative first)
  
  const creditors = usersCopy.filter(user => user.balance > 0)
    .sort((a, b) => b.balance - a.balance); // Sort by balance (most positive first)
  
  const transactions = [];
  
  // Calculate transactions until all debts are settled
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    
    // Get absolute debt and credit values
    const debtAmount = Math.abs(debtor.balance);
    const creditAmount = creditor.balance;
    
    // Determine transaction amount (minimum of debt or credit)
    const transactionAmount = Math.min(debtAmount, creditAmount);
    
    // Add transaction
    if (transactionAmount > 0) {
      // Find common expenses between debtor and creditor
      const debtorExpenses = userExpensesMap[debtor.id] || new Set();
      const creditorExpenses = Array.from(debtorExpenses)
        .filter(expenseId => {
          const expense = expenseMap[expenseId];
          return expense && expense.payer_id === creditor.id;
        });
      
      // Get expense names
      const relatedExpenses = creditorExpenses.map(expenseId => {
        return expenseMap[expenseId]?.name || '';
      }).filter(name => name);
      
      transactions.push({
        from: debtor.id,
        to: creditor.id,
        fromName: debtor.name,
        toName: creditor.name,
        amount: parseFloat(transactionAmount.toFixed(2)),
        fromBankAccount: userMap[debtor.id]?.bank_account,
        toBankAccount: userMap[creditor.id]?.bank_account,
        fromBankName: userMap[debtor.id]?.bank_name,
        toBankName: userMap[creditor.id]?.bank_name,
        relatedExpenses: relatedExpenses
      });
    }
    
    // Update balances
    debtor.balance += transactionAmount;
    creditor.balance -= transactionAmount;
    
    // Remove users who have settled their balances
    if (Math.abs(debtor.balance) < 0.01) {
      debtors.shift();
    }
    
    if (Math.abs(creditor.balance) < 0.01) {
      creditors.shift();
    }
  }
  
  return transactions;
}

// Get expense summary
exports.getExpenseSummary = async (req, res) => {
  try {
    const { expenseId } = req.params;

    // Get expense details
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select(`
        *,
        payer:users(id, name, bank_account, bank_name)
      `)
      .eq('id', expenseId)
      .single();
    
    if (expenseError) {
      if (expenseError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Expense not found' });
      }
      throw expenseError;
    }
    
    // Get participants for this expense
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        *,
        user:users(id, name, bank_account, bank_name)
      `)
      .eq('expense_id', expenseId);
    
    if (participantsError) throw participantsError;
    
    // Create a map of all users involved
    const userMap = {};
    
    // Add payer
    userMap[expense.payer.id] = {
      id: expense.payer.id,
      name: expense.payer.name,
      bank_account: expense.payer.bank_account,
      bank_name: expense.payer.bank_name
    };
    
    // Add participants
    participants.forEach(participant => {
      if (participant.user) {
        userMap[participant.user.id] = {
          id: participant.user.id,
          name: participant.user.name,
          bank_account: participant.user.bank_account,
          bank_name: participant.user.bank_name
        };
      }
    });
    
    // Calculate transactions for this expense
    const expenseTransactions = [];
    
    // For each participant who is not the payer, create a transaction
    participants.forEach(participant => {
      if (participant.user_id !== expense.payer_id) {
        expenseTransactions.push({
          expense_id: expense.id,
          from_user_id: participant.user_id,
          to_user_id: expense.payer_id,
          amount: participant.amount
        });
      }
    });
    
    // Get payment status for these transactions
    const transactions = [];
    
    for (const trans of expenseTransactions) {
      // Generate a unique transaction ID based on expense, from, and to - as a string
      const transactionId = String(`${trans.expense_id}-${trans.from_user_id}-${trans.to_user_id}`);
      
      // Check if payment status exists
      const { data: paymentStatus, error: paymentError } = await supabase
        .from('transaction_payment_status')
        .select('*')
        .eq('transaction_id', transactionId)
        .maybeSingle();
      
      if (paymentError) throw paymentError;
      
      transactions.push({
        id: transactionId,
        fromUserId: trans.from_user_id,
        toUserId: trans.to_user_id,
        fromName: userMap[trans.from_user_id]?.name || 'Unknown',
        toName: userMap[trans.to_user_id]?.name || 'Unknown',
        amount: parseFloat(trans.amount),
        fromBankAccount: userMap[trans.from_user_id]?.bank_account,
        toBankAccount: userMap[trans.to_user_id]?.bank_account,
        fromBankName: userMap[trans.from_user_id]?.bank_name,
        toBankName: userMap[trans.to_user_id]?.bank_name,
        relatedExpenses: [expense.name],
        expenseIds: [expense.id],
        payment_status: paymentStatus || {
          transaction_id: transactionId,
          paid: false,
          paid_at: null
        }
      });
    }
    
    // Get all payment statuses for this expense to check if all are completed
    const allPaymentStatuses = transactions.map(t => t.payment_status);
    const allCompleted = allPaymentStatuses.length > 0 && allPaymentStatuses.every(ps => ps.paid);
    
    // Return summary data
    res.status(200).json({
      expense: {
        ...expense,
        participants: participants || []
      },
      transactions,
      allCompleted
    });
  } catch (error) {
    console.error(`Error generating summary for expense ${req.params.expenseId}:`, error);
    res.status(500).json({ 
      message: 'Error generating expense summary', 
      error: error.message 
    });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { paid } = req.body;
    
    // Validate request
    if (paid === undefined) {
      return res.status(400).json({ message: 'Missing paid status' });
    }
    
    // Ensure transaction_id is treated as a string
    const transactionIdStr = String(paymentId);
    
    // Check if payment status exists
    const { data: existingStatus, error: checkError } = await supabase
      .from('transaction_payment_status')
      .select('*')
      .eq('transaction_id', transactionIdStr)
      .maybeSingle();
    
    if (checkError) throw checkError;
    
    let data;
    let error;
    
    if (existingStatus) {
      // Update existing status
      // Adjust timezone for Vietnam (GMT+7)
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // Add 7 hours
      
      const updateData = {
        paid,
        paid_at: paid ? vietnamTime.toISOString() : null,
        updated_at: vietnamTime.toISOString()
      };
      
      ({ data, error } = await supabase
        .from('transaction_payment_status')
        .update(updateData)
        .eq('transaction_id', transactionIdStr)
        .select()
        .single());
    } else {
      // Create new status
      // Adjust timezone for Vietnam (GMT+7)
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // Add 7 hours
      
      const insertData = {
        transaction_id: transactionIdStr,
        paid,
        paid_at: paid ? vietnamTime.toISOString() : null
      };
      
      ({ data, error } = await supabase
        .from('transaction_payment_status')
        .insert(insertData)
        .select()
        .single());
    }
    
    if (error) throw error;
    
    res.status(200).json(data);
  } catch (error) {
    console.error(`Error updating payment status for transaction ${req.params.paymentId}:`, error);
    res.status(500).json({ 
      message: 'Error updating payment status', 
      error: error.message 
    });
  }
};

// Get expenses with payment status
exports.getExpensesWithStatus = async (req, res) => {
  try {
    // Get all expenses with payer info
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(`
        id,
        name,
        amount,
        payer_id,
        created_at
      `)
      .order('created_at', { ascending: false });
    
    if (expensesError) throw expensesError;
    
    // Get all users for mapping IDs to names
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name');
    
    if (usersError) throw usersError;
    
    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user.name;
      return acc;
    }, {});
    
    // Process all expenses to add payment status
    const expensesWithStatus = [];
    
    for (const expense of expenses) {
      // Get participants for this expense
      const { data: participants, error: participantsError } = await supabase
        .from('participants')
        .select('user_id, amount')
        .eq('expense_id', expense.id);
      
      if (participantsError) throw participantsError;
      
      // Count how many payment transactions are needed
      const paymentCount = participants.filter(p => p.user_id !== expense.payer_id).length;
      
      // Calculate transactions for this expense
      const expenseTransactions = [];
      
      // For each participant who is not the payer, create a transaction
      participants.forEach(participant => {
        if (participant.user_id !== expense.payer_id) {
          expenseTransactions.push({
            expense_id: expense.id,
            from_user_id: participant.user_id,
            to_user_id: expense.payer_id
          });
        }
      });
      
      // Count completed payments
      let completedCount = 0;
      
      for (const trans of expenseTransactions) {
        // Generate a unique transaction ID based on expense, from, and to - as a string
        const transactionId = String(`${trans.expense_id}-${trans.from_user_id}-${trans.to_user_id}`);
        
        // Check if payment status exists and is paid
        const { data: paymentStatus, error: paymentError } = await supabase
          .from('transaction_payment_status')
          .select('paid')
          .eq('transaction_id', transactionId)
          .maybeSingle();
        
        if (paymentError) throw paymentError;
        
        if (paymentStatus && paymentStatus.paid) {
          completedCount++;
        }
      }
      
      expensesWithStatus.push({
        ...expense,
        payer_name: userMap[expense.payer_id] || 'Unknown',
        payment_count: paymentCount,
        completed_count: completedCount,
        all_payments_completed: paymentCount > 0 && completedCount === paymentCount,
        participants_count: participants.length
      });
    }
    
    res.status(200).json(expensesWithStatus);
  } catch (error) {
    console.error('Error fetching expenses with status:', error);
    res.status(500).json({ 
      message: 'Error fetching expenses with status', 
      error: error.message 
    });
  }
};

// Get expenses with transactions grouped by expense
exports.getExpensesTransactions = async (req, res) => {
  try {
    // Get all expenses with payer info
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(`
        id,
        name,
        amount,
        payer_id,
        created_at
      `)
      .order('created_at', { ascending: false });
    
    if (expensesError) throw expensesError;
    
    // Get all users for mapping
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, bank_account, bank_name');
    
    if (usersError) throw usersError;
    
    // Create a map of users for easy lookup
    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
    
    // Process all expenses to get their transactions
    const expensesWithTransactions = [];
    
    for (const expense of expenses) {
      // Get participants for this expense
      const { data: participants, error: participantsError } = await supabase
        .from('participants')
        .select('user_id, amount')
        .eq('expense_id', expense.id);
      
      if (participantsError) throw participantsError;
      
      // Calculate transactions for this expense
      const expenseTransactions = [];
      
      // For each participant who is not the payer, create a transaction
      participants.forEach(participant => {
        if (participant.user_id !== expense.payer_id) {
          expenseTransactions.push({
            expense_id: expense.id,
            from_user_id: participant.user_id,
            to_user_id: expense.payer_id,
            amount: participant.amount
          });
        }
      });
      
      // Skip expenses with no transactions
      if (expenseTransactions.length === 0) continue;
      
      // Get payment status for these transactions
      const transactions = [];
      
      for (const trans of expenseTransactions) {
        // Generate a unique transaction ID based on expense, from, and to - as a string
        const transactionId = String(`${trans.expense_id}-${trans.from_user_id}-${trans.to_user_id}`);
        
        // Check if payment status exists
        const { data: paymentStatus, error: paymentError } = await supabase
          .from('transaction_payment_status')
          .select('*')
          .eq('transaction_id', transactionId)
          .maybeSingle();
        
        if (paymentError) throw paymentError;
        
        transactions.push({
          id: transactionId,
          fromUserId: trans.from_user_id,
          toUserId: trans.to_user_id,
          fromName: userMap[trans.from_user_id]?.name || 'Unknown',
          toName: userMap[trans.to_user_id]?.name || 'Unknown',
          amount: parseFloat(trans.amount),
          fromBankAccount: userMap[trans.from_user_id]?.bank_account,
          toBankAccount: userMap[trans.to_user_id]?.bank_account,
          fromBankName: userMap[trans.from_user_id]?.bank_name,
          toBankName: userMap[trans.to_user_id]?.bank_name,
          relatedExpenses: [expense.name],
          expenseIds: [expense.id],
          payment_status: paymentStatus || {
            transaction_id: transactionId,
            paid: false,
            paid_at: null
          }
        });
      }
      
      // Get all payment statuses for this expense to check if all are completed
      const allPaymentStatuses = transactions.map(t => t.payment_status);
      const allCompleted = allPaymentStatuses.length > 0 && allPaymentStatuses.every(ps => ps.paid);
      
      // Add to result array
      expensesWithTransactions.push({
        expenseId: expense.id,
        expenseName: expense.name,
        amount: parseFloat(expense.amount),
        date: expense.created_at,
        transactions,
        allCompleted
      });
    }
    
    res.status(200).json(expensesWithTransactions);
  } catch (error) {
    console.error('Error generating expenses transactions:', error);
    res.status(500).json({ 
      message: 'Error generating expenses transactions', 
      error: error.message 
    });
  }
}; 