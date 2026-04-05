const Task = require('../models/Task');

// @desc    Create a new task (Admin only)
// @route   POST /api/tasks
exports.createTask = async (req, res) => {
  try {
    const { title, description, time, days, assignedTo } = req.body;

    if (!title || !time || !assignedTo || !days || days.length === 0) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    const task = await Task.create({
      title,
      description: description || '',
      time,
      days,
      assignedTo,
      createdBy: req.user._id
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email phone');

    res.status(201).json(populatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get tasks (Admin sees created tasks, User sees assigned tasks)
// @route   GET /api/tasks
exports.getTasks = async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'admin') {
      tasks = await Task.find({ createdBy: req.user._id })
        .populate('assignedTo', 'name email phone')
        .sort({ time: 1 });
    } else {
      tasks = await Task.find({ assignedTo: req.user._id })
        .populate('createdBy', 'name email')
        .sort({ time: 1 });
    }
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get tasks for a specific user (Admin only)
// @route   GET /api/tasks/user/:userId
exports.getTasksByUser = async (req, res) => {
  try {
    const tasks = await Task.find({ 
      assignedTo: req.params.userId,
      createdBy: req.user._id 
    }).sort({ time: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update a task (Admin only)
// @route   PUT /api/tasks/:id
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('assignedTo', 'name email phone');

    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a task (Admin only)
// @route   DELETE /api/tasks/:id
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Toggle task active/inactive (Admin only)
// @route   PATCH /api/tasks/:id/toggle
exports.toggleTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.isActive = !task.isActive;
    await task.save();

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
