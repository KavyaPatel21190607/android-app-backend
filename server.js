const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { startScheduler } = require('./services/scheduler');
const { makeReminderCall } = require('./services/twilioService');
const { handleCallStatus } = require('./controllers/callStatusController');
const Task = require('./models/Task');

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Middleware - allows Android app to communicate with this server
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Twilio form-encoded callbacks

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/pair', require('./routes/pairRoutes'));

// Twilio Call Status Webhook (public - no auth, Twilio sends POST with form data)
app.post('/api/call-status', handleCallStatus);

// Health check - visit http://localhost:5000 to test
app.get('/', (req, res) => {
  // Get IST time for display
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  res.json({ 
    message: 'TaskMaster API is running!',
    version: '2.0.0',
    serverTime_IST: `${hours}:${minutes} ${days[now.getDay()]}`,
    features: {
      v2: 'Persistent call retry | Admin call notifications | Profile editing'
    },
    endpoints: {
      auth: '/api/auth',
      tasks: '/api/tasks',
      pair: '/api/pair',
      callStatus: '/api/call-status (Twilio webhook)',
      testCall: '/api/test-call (GET - test Twilio)',
      checkScheduler: '/api/check-tasks (GET - see due tasks)'
    }
  });
});

// TEST: Check what tasks are due right now
app.get('/api/check-tasks', async (req, res) => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];

    const allTasks = await Task.find({ isActive: true })
      .populate('assignedTo', 'name email phone');

    const dueTasks = await Task.find({
      time: currentTime,
      days: currentDay,
      isActive: true
    }).populate('assignedTo', 'name email phone');

    // V2: Active call sessions
    const activeCallSessions = await Task.find({
      callSessionActive: true,
      isActive: true
    }).populate('assignedTo', 'name email phone');

    res.json({
      currentTime_IST: currentTime,
      currentDay: currentDay,
      totalActiveTasks: allTasks.length,
      tasksDueNow: dueTasks.length,
      activeCallSessions: activeCallSessions.length,
      allActiveTasks: allTasks.map(t => ({
        title: t.title,
        time: t.time,
        days: t.days,
        assignedTo: t.assignedTo ? { name: t.assignedTo.name, phone: t.assignedTo.phone } : null,
        lastCallAt: t.lastCallAt,
        callStatus: t.callStatus,
        callAttempts: t.callAttempts,
        callSessionActive: t.callSessionActive,
        nextCallAt: t.nextCallAt
      })),
      dueTasks: dueTasks.map(t => ({
        title: t.title,
        time: t.time,
        days: t.days,
        assignedTo: t.assignedTo ? { name: t.assignedTo.name, phone: t.assignedTo.phone } : null,
        lastCallAt: t.lastCallAt,
        callStatus: t.callStatus,
        callAttempts: t.callAttempts
      })),
      activeRetries: activeCallSessions.map(t => ({
        title: t.title,
        assignedTo: t.assignedTo ? { name: t.assignedTo.name, phone: t.assignedTo.phone } : null,
        callAttempts: t.callAttempts,
        callStatus: t.callStatus,
        nextCallAt: t.nextCallAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TEST: Make a test call to verify Twilio is working
app.get('/api/test-call', async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) {
      return res.status(400).json({ 
        message: 'Provide phone number as query param', 
        example: '/api/test-call?phone=+919876543210' 
      });
    }

    console.log(`[TEST] Making test call to: ${phone}`);
    const call = await makeReminderCall(phone, 'Test Task', 'This is a test call from TaskMaster');
    
    res.json({ 
      success: true, 
      message: `Test call initiated to ${phone}`,
      callSid: call.sid 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Call failed: ' + error.message,
      errorCode: error.code || 'unknown',
      hint: error.code === 21219 
        ? 'Trial account: verify this number at twilio.com/console/phone-numbers/verified' 
        : error.code === 20003 
        ? 'Auth failed: check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on Render env vars'
        : 'Check Render logs for details'
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`TaskMaster Server V2.0 running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
  console.log('Features: Persistent retry | Admin calls | Profile edit');
  console.log('='.repeat(50));
  
  // Start the task reminder scheduler
  startScheduler();
});

// ============================================
// KEEP-ALIVE: Prevent Render free tier from sleeping
// Pings itself every 14 minutes to stay awake
// ============================================
setInterval(() => {
  const https = require('https');
  const http = require('http');
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  const client = url.startsWith('https') ? https : http;
  client.get(url, (res) => {
    console.log(`[KEEP-ALIVE] Pinged server - Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error('[KEEP-ALIVE] Ping failed:', err.message);
  });
}, 14 * 60 * 1000); // Every 14 minutes
