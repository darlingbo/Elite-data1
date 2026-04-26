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
7. **Set up Flutterwave for payments**:
   - Create an account at https://dashboard.flutterwave.com
   - Get your public key and secret key
   - Update `checkout.html` line 67: Replace `"FLUTTERWAVE_PUBLIC_KEY"` with your Flutterwave public key
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
- Flutterwave for Mobile Money payments

## Flutterwave Integration Details

### Getting Flutterwave Keys:
1. Sign up at https://dashboard.flutterwave.com
2. Go to **Settings** → **API** 
3. Copy your **Public Key** and **Secret Key**
4. In `checkout.html`, replace `"FLUTTERWAVE_PUBLIC_KEY"` with your public key on line 67

### Testing Payments:
- Use test card: `5531886652142950`
- Test Momo: Use any mobile number with Flutterwave test data
- In Flutterwave dashboard, enable Mobile Money for Ghana

### Payment Flow:
1. User selects data/airtime bundle
2. Enters their phone number
3. Clicks "Buy Now" → Redirected to `checkout.html`
4. Clicks "Pay with Mobile Money"
5. Flutterwave popup opens for payment
6. On successful payment:
   - Order created in database with status "completed"
   - Telegram alert sent to admin
   - User redirected to dashboard
   - Data/airtime delivered (integrate with carrier API or manual process)

## Deployment

Deploy to:
- GitHub Pages (for static files)
- Netlify (supports functions)
- Vercel (supports edge functions)
- AWS Lambda (for serverless backend)