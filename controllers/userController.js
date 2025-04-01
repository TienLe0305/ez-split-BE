const supabase = require('../utils/supabase');

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, bank_account, bank_name')
      .order('id');
    
    if (error) throw error;
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      message: 'Error fetching users', 
      error: error.message 
    });
  }
};

// Get a single user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('users')
      .select('id, name, bank_account, bank_name')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      message: 'Error fetching user', 
      error: error.message 
    });
  }
};

// Create a new user
exports.createUser = async (req, res) => {
  try {
    const { name, bank_account, bank_name } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, bank_account, bank_name }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      message: 'Error creating user', 
      error: error.message 
    });
  }
};

// Update a user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, bank_account, bank_name } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    
    const { data, error } = await supabase
      .from('users')
      .update({ name, bank_account, bank_name })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      message: 'Error updating user', 
      error: error.message 
    });
  }
};

// Delete a user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is referenced in expenses or participants
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('id')
      .eq('payer_id', id)
      .limit(1);
    
    if (expensesError) throw expensesError;
    
    if (expensesData && expensesData.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete user: User is referenced as payer in one or more expenses'
      });
    }
    
    const { data: participantsData, error: participantsError } = await supabase
      .from('participants')
      .select('id')
      .eq('user_id', id)
      .limit(1);
    
    if (participantsError) throw participantsError;
    
    if (participantsData && participantsData.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete user: User is referenced as participant in one or more expenses'
      });
    }
    
    // If no references, proceed with deletion
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    
    if (deleteError) throw deleteError;
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      message: 'Error deleting user', 
      error: error.message 
    });
  }
}; 