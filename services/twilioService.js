const twilio = require('twilio');

// Validate Twilio credentials at startup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const serviceSid = process.env.TWILIO_SERVICE_SID;

if (!accountSid || !authToken || !fromNumber) {
  console.error('[TWILIO] ❌ ERROR: Missing Twilio credentials!');
  console.error('[TWILIO]   TWILIO_ACCOUNT_SID:', accountSid ? '✅ Set' : '❌ MISSING');
  console.error('[TWILIO]   TWILIO_AUTH_TOKEN:', authToken ? '✅ Set' : '❌ MISSING');
  console.error('[TWILIO]   TWILIO_PHONE_NUMBER:', fromNumber ? '✅ Set' : '❌ MISSING');
} else {
  console.log('[TWILIO] ✅ Twilio credentials loaded');
  console.log('[TWILIO]   Account SID:', accountSid.substring(0, 10) + '...');
  console.log('[TWILIO]   From Number:', fromNumber);
  console.log('[TWILIO]   Service SID:', serviceSid ? serviceSid.substring(0, 10) + '...' : '⚠️ Not set (optional)');
}

// Initialize Twilio client with your credentials
const client = twilio(accountSid, authToken);

/**
 * Get the status callback URL for Twilio
 * Uses RENDER_EXTERNAL_URL env var or falls back to localhost
 */
const getStatusCallbackUrl = (taskId) => {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}/api/call-status?taskId=${taskId}`;
};

/**
 * Make an outbound voice call to remind user about a task
 * The call will use text-to-speech to tell the user their task
 * 
 * @param {string} toPhoneNumber - User's phone in E.164 format (e.g., +919876543210)
 * @param {string} taskTitle - The task name
 * @param {string} taskDescription - Task details
 * @param {string} taskId - Task ID for status callback tracking
 * @param {number} attemptNumber - Which attempt this is (for the TwiML message)
 */
const makeReminderCall = async (toPhoneNumber, taskTitle, taskDescription, taskId = null, attemptNumber = 1) => {
  try {
    // Validate phone number
    if (!toPhoneNumber || !toPhoneNumber.startsWith('+')) {
      throw new Error(`Invalid phone number: "${toPhoneNumber}". Must be in E.164 format (e.g., +919876543210)`);
    }

    console.log(`[TWILIO] Making call to: ${toPhoneNumber} for task: "${taskTitle}" (Attempt #${attemptNumber})`);
    console.log(`[TWILIO] From: ${fromNumber}`);

    // TwiML = Twilio Markup Language (tells Twilio what to say on the call)
    const twimlMessage = `
      <Response>
        <Say voice="Polly.Joanna" language="en-US">
          Hello! This is your TaskMaster reminder.
          ${attemptNumber > 1 ? `This is attempt number ${attemptNumber}.` : ''}
          It's time for your task: ${taskTitle}.
          ${taskDescription ? 'Details: ' + taskDescription + '.' : ''}
          Please start your task now.
          ${attemptNumber > 1 ? 'Please pick up to stop future reminders.' : ''}
          Good luck! Goodbye.
        </Say>
        <Pause length="1"/>
        <Say voice="Polly.Joanna" language="en-US">
          Repeating: Your task ${taskTitle} is due now. Have a great day!
        </Say>
      </Response>
    `;

    const callOptions = {
      twiml: twimlMessage,
      to: toPhoneNumber,
      from: fromNumber,
      timeout: 30 // Ring for 30 seconds before giving up
    };

    // Add status callback if taskId is provided
    if (taskId) {
      const callbackUrl = getStatusCallbackUrl(taskId);
      callOptions.statusCallback = callbackUrl;
      callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
      callOptions.statusCallbackMethod = 'POST';
      console.log(`[TWILIO] Status callback URL: ${callbackUrl}`);
    }

    // Add Service SID if configured
    if (serviceSid) {
      callOptions.messagingServiceSid = serviceSid;
    }

    const call = await client.calls.create(callOptions);

    console.log(`[TWILIO] ✅ Call initiated - SID: ${call.sid} | To: ${toPhoneNumber} | Task: ${taskTitle} | Attempt: ${attemptNumber}`);
    return call;
  } catch (error) {
    console.error(`[TWILIO] ❌ Error making call to ${toPhoneNumber}:`, error.message);
    
    // Log specific Twilio error details
    if (error.code) {
      console.error(`[TWILIO] Error Code: ${error.code}`);
      console.error(`[TWILIO] More Info: ${error.moreInfo || 'N/A'}`);
      
      // Common Twilio error codes
      if (error.code === 21608) {
        console.error('[TWILIO] 💡 The "From" number is not a valid Twilio phone number');
      } else if (error.code === 21214) {
        console.error('[TWILIO] 💡 The "To" number is not a valid phone number');
      } else if (error.code === 21219) {
        console.error('[TWILIO] 💡 The "To" number is not a verified number (trial account limitation)');
      } else if (error.code === 20003) {
        console.error('[TWILIO] 💡 Authentication failed - check Account SID and Auth Token');
      } else if (error.code === 21610) {
        console.error('[TWILIO] 💡 The number has opted out / unsubscribed');
      }
    }
    
    throw error;
  }
};

/**
 * Make a notification call to admin that user didn't pick up
 * 
 * @param {string} adminPhone - Admin's phone in E.164 format
 * @param {string} userName - Name of the user who didn't pick up
 * @param {string} taskTitle - The task name
 * @param {number} attemptNumber - How many calls have been made
 */
const makeAdminNotificationCall = async (adminPhone, userName, taskTitle, attemptNumber) => {
  try {
    if (!adminPhone || !adminPhone.startsWith('+')) {
      console.log(`[TWILIO] ⚠️ Admin has no valid phone number, skipping notification call`);
      return null;
    }

    console.log(`[TWILIO] 📞 Notifying admin at ${adminPhone}: ${userName} didn't pick up for "${taskTitle}" (Attempt #${attemptNumber})`);

    const twimlMessage = `
      <Response>
        <Say voice="Polly.Joanna" language="en-US">
          Hello Admin! This is a TaskMaster alert.
          Your user ${userName} did not pick up the call for task: ${taskTitle}.
          This was attempt number ${attemptNumber}.
          The system will retry in 2 minutes.
          Thank you.
        </Say>
      </Response>
    `;

    const call = await client.calls.create({
      twiml: twimlMessage,
      to: adminPhone,
      from: fromNumber,
      timeout: 30
    });

    console.log(`[TWILIO] ✅ Admin notification call initiated - SID: ${call.sid}`);
    return call;
  } catch (error) {
    console.error(`[TWILIO] ❌ Error notifying admin:`, error.message);
    // Don't throw - admin notification failure shouldn't break the flow
    return null;
  }
};

module.exports = { makeReminderCall, makeAdminNotificationCall };
