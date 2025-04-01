-- Create Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  bank_account VARCHAR(255),
  bank_name VARCHAR(50) DEFAULT 'VPB'
);

-- Create Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payer_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Participants table
CREATE TABLE IF NOT EXISTS participants (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL
);

-- Create Payments table to track payment status
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create transaction_payment_status table
CREATE TABLE IF NOT EXISTS transaction_payment_status (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) NOT NULL,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_id)
);

-- Insert default users with bank accounts and bank names
INSERT INTO users (name, bank_account, bank_name) VALUES 
('Tiến Lê', '0041000382078', 'VCB'), 
('Trà Nguyễn', '152748566', 'VPB'), 
('Tuấn Hoàng', '142451433', 'VPB'), 
('Yên Nguyễn', '137146843', 'VPB'), 
('Karin', '257357201', 'VPB'), 
('Duy Trần', '29091998', 'VPB'),
('Minh Lê', NULL, NULL)
ON CONFLICT DO NOTHING; 