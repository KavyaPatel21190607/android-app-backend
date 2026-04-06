const express = require('express');
const router = express.Router();
const { 
  createTask, getTasks, getTasksByUser, 
  updateTask, deleteTask, toggleTask,
  getCallStatus, getCallStatusAll, getCallHistory
} = require('../controllers/taskController');
const { protect, adminOnly } = require('../middleware/auth');

// POST /api/tasks - Create task (Admin only)
router.post('/', protect, adminOnly, createTask);

// GET /api/tasks - Get all tasks (filtered by role)
router.get('/', protect, getTasks);

// GET /api/tasks/call-status/all - Get call status for all admin's tasks
// ⚠️ Must be BEFORE /:id routes to avoid conflict
router.get('/call-status/all', protect, adminOnly, getCallStatusAll);

// GET /api/tasks/call-history - Full call history for admin dashboard
// ⚠️ Must be BEFORE /:id routes to avoid conflict
router.get('/call-history', protect, adminOnly, getCallHistory);

// GET /api/tasks/user/:userId - Get tasks for specific user (Admin only)
router.get('/user/:userId', protect, adminOnly, getTasksByUser);

// GET /api/tasks/:id/call-status - Get call status for specific task (Admin only)
router.get('/:id/call-status', protect, adminOnly, getCallStatus);

// PUT /api/tasks/:id - Update task (Admin only)
router.put('/:id', protect, adminOnly, updateTask);

// DELETE /api/tasks/:id - Delete task (Admin only)
router.delete('/:id', protect, adminOnly, deleteTask);

// PATCH /api/tasks/:id/toggle - Toggle active/inactive (Admin only)
router.patch('/:id/toggle', protect, adminOnly, toggleTask);

module.exports = router;
