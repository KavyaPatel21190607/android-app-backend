const twilio = require('twilio');

// Initialize Twilio client with your credentials
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Make an outbound voice call to remind user about a task
 * The call will use text-to-speech to tell the user their task
 * 
 * @param {string} toPhoneNumber - User's phone in E.164 format (e.g., +919876543210)
 * @param {string} taskTitle - The task name
 * @param {string} taskDescription - Task details
 */
const makeReminderCall = async (toPhoneNumber, taskTitle, taskDescription) => {
  try {
    // TwiML = Twilio Markup Language (tells Twilio what to say on the call)
    const twimlMessage = `
      <Response>
        <Say voice="Polly.Joanna" language="en-US">
          Hello! This is your TaskMaster reminder.
          It's time for your task: ${taskTitle}.
          ${taskDescription ? 'Details: ' + taskDescription + '.' : ''}
          Please start your task now.
          Good luck! Goodbye.
        </Say>
        <Pause length="1"/>
        <Say voice="Polly.Joanna" language="en-US">
          Repeating: Your task ${taskTitle} is due now. Have a great day!
        </Say>
      </Response>
    `;

    const call = await client.calls.create({
      twiml: twimlMessage,
      to: toPhoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log(`[TWILIO] Call initiated - SID: ${call.sid} | To: ${toPhoneNumber} | Task: ${taskTitle}`);
    return call;
  } catch (error) {
    console.error(`[TWILIO] Error making call to ${toPhoneNumber}:`, error.message);
    throw error;
  }
};

module.exports = { makeReminderCall };
