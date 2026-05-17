const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv/config');

const confessionRoutes = require('./routes/confessions');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://collegeconfess.vercel.app'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, mobile apps, server requests
      if (!origin) return callback(null, true);

      // Localhost + exact domains
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow Vercel preview URLs
      if (
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }

      callback(null, true); // allow all (optional)
      // callback(new Error("CORS not allowed")); // strict mode
    },
    credentials: true,
  })
);

app.use(express.json());

app.use('/api/confessions', confessionRoutes);

app.get('/', (req, res) => {
  res.send('College Confession API running!');
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });