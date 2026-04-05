const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { startScheduler } = require('./services/scheduler');

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Middleware - allows Android app to communicate with this server
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/pair', require('./routes/pairRoutes'));

// Health check - visit http://localhost:5000 to test
app.get('/', (req, res) => {
  res.json({ 
    message: 'TaskMaster API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      tasks: '/api/tasks',
      pair: '/api/pair'
    }
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`TaskMaster Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
  console.log('='.repeat(50));
  
  // Start the task reminder scheduler
  startScheduler();
});
