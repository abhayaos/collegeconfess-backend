const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv/config');

const confessionRoutes = require('./routes/confessions');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = isProduction
  ? [process.env.FRONTEND_URL, 'https://collegeconfess.vercel.app'].filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/confessions', confessionRoutes);

app.get('/', (req, res) => {
  res.send('College Confession API running!');
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error('MongoDB connection error:', err));
