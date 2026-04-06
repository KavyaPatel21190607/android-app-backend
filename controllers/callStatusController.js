const Task = require('../models/Task');
const User = require('../models/User');

/**
 * Twilio Status Callback Handler
 * Called by Twilio when call status changes (initiated, ringing, answered, completed)
 * 
 * @route POST /api/call-status?taskId=xxx
 * 
 * Twilio sends these CallStatus values:
 * - queued, initiated, ringing → call is being placed
 * - in-progress → user answered
 * - completed → call ended normally (was answered)
 * - no-answer → user didn't pick up
 * - busy → line was busy
 * - failed → call failed
 * - canceled → call was canceled
 */
exports.handleCallStatus = async (req, res) => {
  try {
    const taskId = req.query.taskId;
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    const callDuration = parseInt(req.body.CallDuration || '0');

    console.log(`[CALL-STATUS] Received status for task ${taskId}: ${callStatus} (SID: ${callSid}, Duration: ${callDuration}s)`);

    if (!taskId) {
      console.error('[CALL-STATUS] ❌ No taskId in query params');
      return res.status(200).send('OK'); // Always return 200 to Twilio
    }

    const task = await Task.findById(taskId).populate('createdBy', 'phone name');

    if (!task) {
      console.error(`[CALL-STATUS] ❌ Task not found: ${taskId}`);
      return res.status(200).send('OK');
    }

    // Update call history entry
    const historyEntry = task.callHistory.find(h => h.callSid === callSid);
    if (historyEntry) {
      historyEntry.status = callStatus;
      historyEntry.duration = callDuration;
    }

    // Handle different statuses
    switch (callStatus) {
      case 'initiated':
      case 'ringing':
        task.callStatus = 'ringing';
        console.log(`[CALL-STATUS] 📞 Call ringing for task "${task.title}"`);
        break;

      case 'in-progress':
        task.callStatus = 'ringing'; // Still in progress
        console.log(`[CALL-STATUS] 📞 Call answered for task "${task.title}"`);
        break;

      case 'completed':
        // Call was answered and completed — check duration
        if (callDuration > 0) {
          // User actually picked up and listened
          task.callStatus = 'completed';
          task.callSessionActive = false;
          task.nextCallAt = null;
          console.log(`[CALL-STATUS] ✅ User PICKED UP for task "${task.title}" (${callDuration}s) — stopping retries`);
        } else {
          // Completed with 0 duration = voicemail or no actual conversation
          task.callStatus = 'missed';
          if (task.callAttempts < 10) { // Max 10 retries
            task.nextCallAt = new Date(Date.now() + 2 * 60 * 1000); // Retry in 2 minutes
            console.log(`[CALL-STATUS] ⚠️ Call completed with 0 duration for "${task.title}" — retry in 2 min`);
          } else {
            task.callSessionActive = false;
            console.log(`[CALL-STATUS] 🛑 Max retries reached for "${task.title}" — stopping`);
          }
        }
        break;

      case 'no-answer':
      case 'busy':
        task.callStatus = 'missed';
        if (task.callAttempts < 10) { // Max 10 retries
          task.nextCallAt = new Date(Date.now() + 2 * 60 * 1000); // Retry in 2 minutes
          console.log(`[CALL-STATUS] ❌ User NOT ANSWERED for "${task.title}" — retry #${task.callAttempts + 1} in 2 min`);

          // Notify admin via call
          const { makeAdminNotificationCall } = require('../services/twilioService');
          if (task.createdBy && task.createdBy.phone) {
            const assignedUser = await User.findById(task.assignedTo);
            const userName = assignedUser ? assignedUser.name : 'Unknown User';
            
            // Only notify admin every other missed call to avoid spamming
            const shouldNotifyAdmin = !task.adminNotifiedAt || 
              (Date.now() - new Date(task.adminNotifiedAt).getTime() > 3 * 60 * 1000);
            
            if (shouldNotifyAdmin) {
              makeAdminNotificationCall(
                task.createdBy.phone,
                userName,
                task.title,
                task.callAttempts
              ).catch(err => console.error('[CALL-STATUS] Admin notification error:', err.message));
              
              task.adminNotifiedAt = new Date();
            }
          }
        } else {
          task.callSessionActive = false;
          task.nextCallAt = null;
          console.log(`[CALL-STATUS] 🛑 Max retries (10) reached for "${task.title}" — stopping`);
        }
        break;

      case 'failed':
      case 'canceled':
        task.callStatus = 'missed';
        // Don't retry on failure — could be config issue
        console.log(`[CALL-STATUS] ❌ Call ${callStatus} for "${task.title}" — not retrying`);
        break;
    }

    await task.save();
    
    // Always return 200 to Twilio
    res.status(200).send('OK');
  } catch (error) {
    console.error('[CALL-STATUS] Error processing callback:', error.message);
    res.status(200).send('OK'); // Still return 200 to avoid Twilio retries
  }
};
