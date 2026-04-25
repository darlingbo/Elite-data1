# Ghana Data & Airtime Hub

A website for selling data bundles and airtime in Ghana using MTN, Telecel, Airtel Tigo networks with Mobile Money payments.

## Features

- User authentication with Supabase
- Buy data bundles and airtime
- Transaction history
- Referral system
- Admin panel for managing bundles and orders
- Telegram alerts for payments
- Password reset
- User profile management
- Notifications for order status changes

## Setup

1. Create a Supabase project at https://supabase.com
2. Get your Supabase URL and anon key
3. Set up the database tables:
   - users (via Supabase auth)
   - bundles (id, name, price, details, network)
   - orders (id, user_id, bundle_id, phone, status, created_at)
   - notifications (id, user_id, message, created_at)
4. Deploy the edge function: Copy `supabase/functions/send-telegram/index.ts` to your Supabase project functions.
5. Set environment variables in Supabase:
   - TELEGRAM_BOT_TOKEN
   - TELEGRAM_CHAT_ID
6. Update `js/app.js` with your Supabase URL and key.
7. For payments, integrate with a payment gateway like Flutterwave for Momo.
8. Deploy to GitHub Pages or a hosting service that supports dynamic features.

## Database Schema

Create the following tables in Supabase:

```sql
CREATE TABLE bundles (
  id SERIAL PRIMARY KEY,
  name TEXT,
  price DECIMAL,
  details TEXT,
  network TEXT
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  bundle_id INT REFERENCES bundles(id),
  phone TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Technologies

- HTML, CSS, JavaScript
- Supabase for backend
- Telegram API for alerts