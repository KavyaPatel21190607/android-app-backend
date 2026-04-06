const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const { makeReminderCall, makeAdminNotificationCall } = require('./twilioService');

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
 * Starts the task reminder scheduler (V2 with persistent retry)
 * 
 * Two responsibilities:
 * 1. Check for NEW tasks due at current time → initiate first call
 * 2. Check for RETRY tasks where callSessionActive=true and nextCallAt has passed → make retry call
 */
const startScheduler = () => {
  console.log('[SCHEDULER] ✅ Task reminder scheduler V2 started!');
  console.log('[SCHEDULER] Using IST timezone (Asia/Kolkata)');
  console.log('[SCHEDULER] Current IST time:', getCurrentTime(), getDayName());
  console.log('[SCHEDULER] Features: Persistent retry every 2 min | Admin call notifications | Max 10 retries');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const currentTime = getCurrentTime();
      const currentDay = getDayName();

      // ========== PART 1: Check for NEW tasks due now ==========
      const newTasks = await Task.find({
        time: currentTime,
        days: currentDay,
        isActive: true,
        callSessionActive: false // Not already in a retry loop
      }).populate('assignedTo', 'phone name')
        .populate('createdBy', 'phone name');

      if (newTasks.length > 0) {
        console.log(`[SCHEDULER] 🆕 Found ${newTasks.length} NEW task(s) due at ${currentTime} IST on ${currentDay}`);
      }

      for (const task of newTasks) {
        // Skip if already called in the last 2 minutes (prevent duplicate first calls)
        if (task.lastCallAt) {
          const timeSinceLastCall = Date.now() - new Date(task.lastCallAt).getTime();
          if (timeSinceLastCall < 2 * 60 * 1000) {
            continue;
          }
        }

        // Make the first reminder call if user has a phone number
        if (task.assignedTo && task.assignedTo.phone) {
          console.log(`[SCHEDULER] 📞 FIRST call for task "${task.title}" to ${task.assignedTo.name} (${task.assignedTo.phone})`);
          try {
            const call = await makeReminderCall(
              task.assignedTo.phone,
              task.title,
              task.description,
              task._id.toString(), // Pass taskId for status callback
              1 // Attempt #1
            );

            // Update task tracking
            task.lastCallAt = new Date();
            task.callAttempts = 1;
            task.callStatus = 'ringing';
            task.callSessionActive = true;
            task.lastCallSid = call.sid;
            task.nextCallAt = new Date(Date.now() + 2 * 60 * 1000); // Next retry in 2 min if no answer
            task.callHistory.push({
              callSid: call.sid,
              status: 'initiated',
              attemptNumber: 1,
              calledAt: new Date()
            });
            await task.save();

            console.log(`[SCHEDULER] ✅ First call initiated: "${task.title}" → ${task.assignedTo.name} (SID: ${call.sid})`);
          } catch (error) {
            console.error(`[SCHEDULER] ❌ Failed first call for "${task.title}":`, error.message);
          }
        } else {
          console.log(`[SCHEDULER] ⚠️ Skipping task "${task.title}" - no phone number for user`);
        }
      }

      // ========== PART 2: Check for RETRY tasks ==========
      const retryTasks = await Task.find({
        callSessionActive: true,
        nextCallAt: { $lte: new Date() }, // nextCallAt has passed
        callAttempts: { $lt: 10 }, // Max 10 retries
        isActive: true
      }).populate('assignedTo', 'phone name')
        .populate('createdBy', 'phone name');

      if (retryTasks.length > 0) {
        console.log(`[SCHEDULER] 🔄 Found ${retryTasks.length} task(s) needing RETRY calls`);
      }

      for (const task of retryTasks) {
        if (task.assignedTo && task.assignedTo.phone) {
          const attemptNum = task.callAttempts + 1;
          console.log(`[SCHEDULER] 🔄 RETRY #${attemptNum} for "${task.title}" to ${task.assignedTo.name}`);
          
          try {
            const call = await makeReminderCall(
              task.assignedTo.phone,
              task.title,
              task.description,
              task._id.toString(),
              attemptNum
            );

            // Update tracking
            task.lastCallAt = new Date();
            task.callAttempts = attemptNum;
            task.callStatus = 'ringing';
            task.lastCallSid = call.sid;
            task.nextCallAt = new Date(Date.now() + 2 * 60 * 1000); // Next retry in 2 min
            task.callHistory.push({
              callSid: call.sid,
              status: 'initiated',
              attemptNumber: attemptNum,
              calledAt: new Date()
            });
            await task.save();

            console.log(`[SCHEDULER] ✅ Retry call #${attemptNum}: "${task.title}" → ${task.assignedTo.name} (SID: ${call.sid})`);

            // Notify admin via call that user didn't pick up
            if (task.createdBy && task.createdBy.phone) {
              const shouldNotifyAdmin = !task.adminNotifiedAt || 
                (Date.now() - new Date(task.adminNotifiedAt).getTime() > 3 * 60 * 1000);
              
              if (shouldNotifyAdmin) {
                console.log(`[SCHEDULER] 📞 Calling admin ${task.createdBy.name} - user didn't pick up`);
                makeAdminNotificationCall(
                  task.createdBy.phone,
                  task.assignedTo.name,
                  task.title,
                  attemptNum
                ).catch(err => console.error('[SCHEDULER] Admin notification error:', err.message));
                
                task.adminNotifiedAt = new Date();
                await task.save();
              }
            }
          } catch (error) {
            console.error(`[SCHEDULER] ❌ Failed retry call #${attemptNum} for "${task.title}":`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('[SCHEDULER] Error:', error.message);
    }
  });
};

module.exports = { startScheduler };
