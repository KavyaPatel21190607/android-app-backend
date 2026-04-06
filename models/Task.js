const mongoose = require('mongoose');

const callHistorySchema = new mongoose.Schema({
  callSid: { type: String },
  status: { type: String, enum: ['initiated', 'ringing', 'in-progress', 'completed', 'no-answer', 'busy', 'failed', 'canceled'] },
  attemptNumber: { type: Number },
  calledAt: { type: Date, default: Date.now },
  duration: { type: Number, default: 0 }
}, { _id: false });

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  time: {
    type: String,
    required: [true, 'Task time is required']
    // Format: "HH:MM" in 24-hour format (e.g., "09:30", "14:00")
  },
  days: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must be assigned to a user']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastCallAt: {
    type: Date
  },
  // ===== V2: Call Tracking Fields =====
  callAttempts: {
    type: Number,
    default: 0
  },
  callStatus: {
    type: String,
    enum: ['idle', 'ringing', 'missed', 'completed'],
    default: 'idle'
  },
  callSessionActive: {
    type: Boolean,
    default: false
  },
  lastCallSid: {
    type: String,
    default: ''
  },
  nextCallAt: {
    type: Date
  },
  adminNotifiedAt: {
    type: Date
  },
  callHistory: [callHistorySchema],
  // ===================================
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Task', taskSchema);
