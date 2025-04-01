const supabase = require('../utils/supabase');

// Get all expenses with participants
exports.getAllExpenses = async (req, res) => {
  try {
    // Get expenses
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(`
        *,
        payer:users(id, name)
      `)
      .order('created_at', { ascending: false });
    
    if (expensesError) throw expensesError;
    
    // Get participants for each expense
    const expenseIds = expenses.map(expense => expense.id);
    
    // Only fetch participants if there are expenses
    if (expenseIds.length > 0) {
      const { data: participants, error: participantsError } = await supabase
        .from('participants')
        .select(`
          expense_id,
          user_id,
          amount,
          user:users(id, name)
        `)
        .in('expense_id', expenseIds);
      
      if (participantsError) throw participantsError;
      
      // Group participants by expense_id
      const participantsByExpense = participants.reduce((acc, participant) => {
        if (!acc[participant.expense_id]) {
          acc[participant.expense_id] = [];
        }
        acc[participant.expense_id].push(participant);
        return acc;
      }, {});
      
      // Attach participants to their respective expenses
      const expensesWithParticipants = expenses.map(expense => ({
        ...expense,
        participants: participantsByExpense[expense.id] || []
      }));
      
      res.status(200).json(expensesWithParticipants);
    } else {
      // No expenses, return empty array
      res.status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ 
      message: 'Error fetching expenses', 
      error: error.message 
    });
  }
};

// Get expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select(`
        *,
        payer:users(id, name)
      `)
      .eq('id', id)
      .single();
    
    if (expenseError) {
      if (expenseError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Expense not found' });
      }
      throw expenseError;
    }
    
    // Get participants
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        expense_id,
        user_id,
        amount,
        user:users(id, name)
      `)
      .eq('expense_id', id);
    
    if (participantsError) throw participantsError;
    
    // Check if expense is fully paid
    // For each participant who is not the payer, create a transaction
    const expenseTransactions = [];
    
    participants.forEach(participant => {
      if (participant.user_id !== expense.payer_id) {
        expenseTransactions.push({
          expense_id: expense.id,
          from_user_id: participant.user_id,
          to_user_id: expense.payer_id
        });
      }
    });
    
    // Check payment status for all transactions
    let allCompleted = true;
    
    for (const trans of expenseTransactions) {
      // Generate a unique transaction ID based on expense, from, and to
      const transactionId = `${trans.expense_id}-${trans.from_user_id}-${trans.to_user_id}`;
      
      // Check if payment status exists and is paid
      const { data: paymentStatus, error: paymentError } = await supabase
        .from('transaction_payment_status')
        .select('paid')
        .eq('transaction_id', transactionId)
        .maybeSingle();
      
      if (paymentError) throw paymentError;
      
      if (!paymentStatus || !paymentStatus.paid) {
        allCompleted = false;
        break;
      }
    };
    
    // Include the payment status with the expense
    const expenseWithParticipants = {
      ...expense,
      participants: participants || [],
      allCompleted
    };
    
    res.status(200).json(expenseWithParticipants);
  } catch (error) {
    console.error(`Error fetching expense with ID ${req.params.id}:`, error);
    res.status(500).json({ 
      message: 'Error fetching expense', 
      error: error.message 
    });
  }
};

// Create new expense
exports.createExpense = async (req, res) => {
  const { name, amount, payer_id, participants } = req.body;
  
  // Validate request body
  if (!name || !amount || !payer_id || !participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ 
      message: 'Invalid request. Required fields: name, amount, payer_id, participants (array)' 
    });
  }
  
  // Start a transaction
  try {
    // Insert expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({ name, amount, payer_id })
      .select()
      .single();
    
    if (expenseError) throw expenseError;
    
    // Insert participants
    const participantsToInsert = participants.map(participant => ({
      expense_id: expense.id,
      user_id: participant.user_id,
      amount: participant.amount
    }));
    
    const { error: participantsError } = await supabase
      .from('participants')
      .insert(participantsToInsert);
    
    if (participantsError) {
      // If participants insertion fails, delete the expense
      await supabase.from('expenses').delete().eq('id', expense.id);
      throw participantsError;
    }
    
    // Fetch the complete expense with participants
    const { data: createdExpense } = await supabase
      .from('expenses')
      .select(`
        *,
        payer:users(id, name)
      `)
      .eq('id', expense.id)
      .single();
    
    const { data: createdParticipants } = await supabase
      .from('participants')
      .select(`
        expense_id,
        user_id,
        amount,
        user:users(id, name)
      `)
      .eq('expense_id', expense.id);
    
    // Return the created expense with participants
    res.status(201).json({
      ...createdExpense,
      participants: createdParticipants || []
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ 
      message: 'Error creating expense', 
      error: error.message 
    });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  const { id } = req.params;
  const { name, amount, payer_id, participants } = req.body;
  
  // Validate request body
  if (!name || !amount || !payer_id || !participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ 
      message: 'Invalid request. Required fields: name, amount, payer_id, participants (array)' 
    });
  }
  
  try {
    // Update expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .update({ name, amount, payer_id })
      .eq('id', id)
      .select()
      .single();
    
    if (expenseError) {
      if (expenseError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Expense not found' });
      }
      throw expenseError;
    }
    
    // Delete existing participants
    const { error: deleteError } = await supabase
      .from('participants')
      .delete()
      .eq('expense_id', id);
    
    if (deleteError) throw deleteError;
    
    // Insert new participants
    const participantsToInsert = participants.map(participant => ({
      expense_id: expense.id,
      user_id: participant.user_id,
      amount: participant.amount
    }));
    
    const { error: participantsError } = await supabase
      .from('participants')
      .insert(participantsToInsert);
    
    if (participantsError) throw participantsError;
    
    // Fetch the updated expense with participants
    const { data: updatedExpense } = await supabase
      .from('expenses')
      .select(`
        *,
        payer:users(id, name)
      `)
      .eq('id', expense.id)
      .single();
    
    const { data: updatedParticipants } = await supabase
      .from('participants')
      .select(`
        expense_id,
        user_id,
        amount,
        user:users(id, name)
      `)
      .eq('expense_id', expense.id);
    
    // Return the updated expense with participants
    res.status(200).json({
      ...updatedExpense,
      participants: updatedParticipants || []
    });
  } catch (error) {
    console.error(`Error updating expense with ID ${id}:`, error);
    res.status(500).json({ 
      message: 'Error updating expense', 
      error: error.message 
    });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if expense exists
    const { data: expense, error: checkError } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', id)
      .single();
    
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Expense not found' });
      }
      throw checkError;
    }
    
    // Delete expense (participants will be deleted automatically due to CASCADE constraint)
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);
    
    if (deleteError) throw deleteError;
    
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error(`Error deleting expense with ID ${id}:`, error);
    res.status(500).json({ 
      message: 'Error deleting expense', 
      error: error.message 
    });
  }
}; 