const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv/config');

const confessionRoutes = require('./routes/confessions');
const authRoutes = require('./routes/auth');
const collegeRoutes = require('./routes/colleges');
const roomRoutes = require('./routes/rooms');
const logRoutes = require('./routes/logs');
const notificationRoutes = require('./routes/notifications');
const galiRoutes = require('./routes/gali');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://guffsansar.vercel.app',
];

const corsCheck = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  if (origin.endsWith('.vercel.app')) return callback(null, true);
  callback(new Error('Not allowed by CORS'));
};

const io = new Server(server, {
  cors: {
    origin: corsCheck,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingInterval: 5000,
  pingTimeout: 3000,
});

app.set('trust proxy', 1);
app.set('io', io);

app.use(helmet());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(cors({ origin: corsCheck, credentials: true }));
app.use(cookieParser());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Payload too large' });
  }
  next(err);
});

app.use('/api/confessions', confessionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegeRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/gali', galiRoutes);

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
  });

  socket.on('register-user', (userId) => {
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });
});

app.get('/', (req, res) => {
  res.send('Guff Sansar API running!');
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });