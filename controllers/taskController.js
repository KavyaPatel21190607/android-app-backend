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
      .populate('assignedTo', 'name email phone')
      .populate('createdBy', 'name email');

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
    // Get today's date string for completion daily reset
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStr = todayIST.toISOString().split('T')[0];

    if (req.user.role === 'admin') {
      tasks = await Task.find({ createdBy: req.user._id })
        .populate('assignedTo', 'name email phone')
        .populate('createdBy', 'name email')
        .sort({ time: 1 });
    } else {
      tasks = await Task.find({ assignedTo: req.user._id })
        .populate('assignedTo', 'name email phone')
        .populate('createdBy', 'name email')
        .sort({ time: 1 });
    }

    // V3: Auto-reset completion if it's a new day
    const tasksJson = tasks.map(t => {
      const taskObj = t.toObject();
      if (taskObj.completedByUser && taskObj.lastCompletionDate !== todayStr) {
        taskObj.completedByUser = false;
        taskObj.completedAt = null;
        taskObj.completionNote = '';
      }
      return taskObj;
    });

    res.json(tasksJson);
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
    })
    .populate('assignedTo', 'name email phone')
    .populate('createdBy', 'name email')
    .sort({ time: 1 });
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
    ).populate('assignedTo', 'name email phone')
     .populate('createdBy', 'name email');

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
    
    // If deactivating, also stop any active call session
    if (!task.isActive) {
      task.callSessionActive = false;
      task.callStatus = 'idle';
      task.nextCallAt = null;
    }
    
    await task.save();

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get call status for a specific task (Admin only)
// @route   GET /api/tasks/:id/call-status
exports.getCallStatus = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email phone');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Calculate time remaining for next call
    let timeRemainingMs = 0;
    if (task.callSessionActive && task.nextCallAt) {
      timeRemainingMs = Math.max(0, new Date(task.nextCallAt).getTime() - Date.now());
    }

    res.json({
      _id: task._id,
      title: task.title,
      assignedTo: task.assignedTo,
      callStatus: task.callStatus,
      callAttempts: task.callAttempts,
      callSessionActive: task.callSessionActive,
      nextCallAt: task.nextCallAt,
      timeRemainingMs: timeRemainingMs,
      timeRemainingFormatted: formatTimeRemaining(timeRemainingMs),
      lastCallAt: task.lastCallAt,
      callHistory: task.callHistory
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get call status for ALL tasks of this admin
// @route   GET /api/tasks/call-status/all
exports.getCallStatusAll = async (req, res) => {
  try {
    const tasks = await Task.find({ createdBy: req.user._id })
      .populate('assignedTo', 'name email phone')
      .sort({ time: 1 });

    // Get today's date for completion check
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStr = todayIST.toISOString().split('T')[0];

    const callStatusList = tasks.map(task => {
      let timeRemainingMs = 0;
      if (task.callSessionActive && task.nextCallAt) {
        timeRemainingMs = Math.max(0, new Date(task.nextCallAt).getTime() - Date.now());
      }

      // Auto-reset if completion is from a previous day
      const isCompletedToday = task.completedByUser && task.lastCompletionDate === todayStr;

      return {
        _id: task._id,
        title: task.title,
        time: task.time,
        assignedTo: task.assignedTo,
        callStatus: task.callStatus,
        callAttempts: task.callAttempts,
        totalMissedCalls: task.totalMissedCalls || 0,
        callSessionActive: task.callSessionActive,
        nextCallAt: task.nextCallAt,
        timeRemainingMs: timeRemainingMs,
        timeRemainingFormatted: formatTimeRemaining(timeRemainingMs),
        lastCallAt: task.lastCallAt,
        isActive: task.isActive,
        // V3: Completion data
        completedByUser: isCompletedToday,
        completedAt: isCompletedToday ? task.completedAt : null,
        completionNote: isCompletedToday ? task.completionNote : ''
      };
    });

    res.json(callStatusList);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get full call history for all tasks (Admin only)
// @route   GET /api/tasks/call-history
exports.getCallHistory = async (req, res) => {
  try {
    const tasks = await Task.find({ 
      createdBy: req.user._id,
      callAttempts: { $gt: 0 } // Only tasks that have had at least one call
    })
    .populate('assignedTo', 'name email phone')
    .sort({ lastCallAt: -1 });

    let grandTotalMissed = 0;
    let grandTotalCalls = 0;

    const history = tasks.map(task => {
      const totalMissed = task.totalMissedCalls || 0;
      const totalCalls = task.callAttempts || 0;
      grandTotalMissed += totalMissed;
      grandTotalCalls += totalCalls;

      // Format call history entries with readable dates
      const formattedHistory = (task.callHistory || []).map(entry => {
        const calledAt = new Date(entry.calledAt);
        // Convert to IST for display
        const istDate = new Date(calledAt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const dateStr = istDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = istDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        return {
          attemptNumber: entry.attemptNumber,
          status: entry.status,
          calledAt: entry.calledAt,
          dateFormatted: dateStr,
          timeFormatted: timeStr,
          duration: entry.duration,
          wasPickedUp: entry.duration > 0 && (entry.status === 'completed' || entry.status === 'in-progress')
        };
      });

      return {
        _id: task._id,
        title: task.title,
        time: task.time,
        days: task.days,
        assignedTo: task.assignedTo,
        callStatus: task.callStatus,
        callAttempts: totalCalls,
        totalMissedCalls: totalMissed,
        callSessionActive: task.callSessionActive,
        lastCallAt: task.lastCallAt,
        wasPickedUp: task.callStatus === 'completed',
        callHistory: formattedHistory
      };
    });

    res.json({
      grandTotalMissed,
      grandTotalCalls,
      tasksWithCalls: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
// @desc    Mark task as completed/uncompleted by user
// @route   PATCH /api/tasks/:id/complete
exports.markTaskComplete = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Verify the requesting user is the one assigned to the task
    if (task.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the assigned user can mark this task as completed' });
    }

    // Get today's date string (IST)
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStr = todayIST.toISOString().split('T')[0];

    // Toggle completion
    const isCurrentlyCompleted = task.completedByUser && task.lastCompletionDate === todayStr;
    
    if (isCurrentlyCompleted) {
      // Un-complete (toggle off)
      task.completedByUser = false;
      task.completedAt = null;
      task.completionNote = '';
      task.lastCompletionDate = '';
    } else {
      // Mark as completed
      task.completedByUser = true;
      task.completedAt = new Date();
      task.completionNote = req.body.note || '';
      task.lastCompletionDate = todayStr;
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email phone')
      .populate('createdBy', 'name email');

    res.json(populatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper: Format milliseconds to MM:SS
function formatTimeRemaining(ms) {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
