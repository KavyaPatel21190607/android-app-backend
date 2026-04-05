const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const { makeReminderCall } = require('./twilioService');

// Get current day name in IST (Indian Standard Time)
const getDayName = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // Use IST timezone
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return days[now.getDay()];
};

// Get current time in HH:MM format (24-hour) in IST
const getCurrentTime = () => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Starts the task reminder scheduler
 * Runs every minute and checks for tasks due at the current time (IST)
 * If a task is due, it triggers a Twilio voice call to the assigned user
 */
const startScheduler = () => {
  console.log('[SCHEDULER] Task reminder scheduler started!');
  console.log('[SCHEDULER] Using IST timezone (Asia/Kolkata)');
  console.log('[SCHEDULER] Current IST time:', getCurrentTime(), getDayName());
  console.log('[SCHEDULER] Checking for due tasks every minute...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const currentTime = getCurrentTime();
      const currentDay = getDayName();

      // Find active tasks scheduled for current time and day
      const tasks = await Task.find({
        time: currentTime,
        days: currentDay,
        isActive: true
      }).populate('assignedTo', 'phone name');

      if (tasks.length > 0) {
        console.log(`[SCHEDULER] Found ${tasks.length} task(s) due at ${currentTime} IST on ${currentDay}`);
      }

      for (const task of tasks) {
        // Skip if already called in the last 2 minutes (prevent duplicate calls)
        if (task.lastCallAt) {
          const timeSinceLastCall = Date.now() - new Date(task.lastCallAt).getTime();
          if (timeSinceLastCall < 2 * 60 * 1000) {
            continue; // Skip - already called recently
          }
        }

        // Make the reminder call if user has a phone number
        if (task.assignedTo && task.assignedTo.phone) {
          console.log(`[SCHEDULER] Attempting call for task "${task.title}" to ${task.assignedTo.name} (${task.assignedTo.phone})`);
          try {
            await makeReminderCall(
              task.assignedTo.phone,
              task.title,
              task.description
            );

            // Record that we called so we don't call again
            task.lastCallAt = new Date();
            await task.save();

            console.log(`[SCHEDULER] ✅ Reminder call made: "${task.title}" → ${task.assignedTo.name}`);
          } catch (error) {
            console.error(`[SCHEDULER] ❌ Failed to call for "${task.title}":`, error.message);
            console.error(`[SCHEDULER] ❌ Full error:`, error);
          }
        } else {
          console.log(`[SCHEDULER] ⚠️ Skipping task "${task.title}" - no phone number for user`);
        }
      }
    } catch (error) {
      console.error('[SCHEDULER] Error:', error.message);
    }
  });
};

module.exports = { startScheduler };
