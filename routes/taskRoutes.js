const express = require('express');
const router = express.Router();
const { 
  createTask, getTasks, getTasksByUser, 
  updateTask, deleteTask, toggleTask 
} = require('../controllers/taskController');
const { protect, adminOnly } = require('../middleware/auth');

// POST /api/tasks - Create task (Admin only)
router.post('/', protect, adminOnly, createTask);

// GET /api/tasks - Get all tasks (filtered by role)
router.get('/', protect, getTasks);

// GET /api/tasks/user/:userId - Get tasks for specific user (Admin only)
router.get('/user/:userId', protect, adminOnly, getTasksByUser);

// PUT /api/tasks/:id - Update task (Admin only)
router.put('/:id', protect, adminOnly, updateTask);

// DELETE /api/tasks/:id - Delete task (Admin only)
router.delete('/:id', protect, adminOnly, deleteTask);

// PATCH /api/tasks/:id/toggle - Toggle active/inactive (Admin only)
router.patch('/:id/toggle', protect, adminOnly, toggleTask);

module.exports = router;
