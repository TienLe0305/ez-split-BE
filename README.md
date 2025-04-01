# EzSplitPVN Backend

This is the backend API for the EzSplitPVN application, built with Express.js and Supabase.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

3. Set up database tables:
   - Create a new Supabase project
   - Go to the SQL Editor in Supabase
   - Run the SQL statements in `database/setup.sql` to create tables and insert default users

## Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with nodemon

## API Endpoints

### Users
- `GET /api/users` - Get all users

### Expenses
- `GET /api/expenses` - Get all expenses with participants
- `GET /api/expenses/:id` - Get a specific expense by ID
- `POST /api/expenses` - Create a new expense
- `PUT /api/expenses/:id` - Update an existing expense
- `DELETE /api/expenses/:id` - Delete an expense

### Summary
- `GET /api/summary` - Get expense summary and calculated transactions

## Examples

### Creating an expense

```json
POST /api/expenses
{
  "name": "Dinner",
  "amount": 100000,
  "payer_id": 1,
  "participants": [
    {
      "user_id": 1,
      "amount": 20000
    },
    {
      "user_id": 2,
      "amount": 20000
    },
    {
      "user_id": 3,
      "amount": 20000
    },
    {
      "user_id": 4,
      "amount": 20000
    },
    {
      "user_id": 5,
      "amount": 20000
    }
  ]
}
```

### Get Summary

```json
GET /api/summary
{
  "userSummary": [
    {
      "id": 1,
      "name": "Phương",
      "paid": 100000,
      "spent": 20000,
      "balance": 80000
    },
    ...
  ],
  "transactions": [
    {
      "from": 2,
      "to": 1,
      "fromName": "Thắng",
      "toName": "Phương",
      "amount": 20000
    },
    ...
  ]
}
``` 