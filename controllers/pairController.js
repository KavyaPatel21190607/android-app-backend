const User = require('../models/User');

// @desc    Pair admin with user using 6-digit code
// @route   POST /api/pair
exports.pairUsers = async (req, res) => {
  try {
    const { pairCode } = req.body;
    const currentUser = req.user;

    if (!pairCode) {
      return res.status(400).json({ message: 'Please enter a pair code' });
    }

    // Find user with this pair code
    const targetUser = await User.findOne({ pairCode });
    
    if (!targetUser) {
      return res.status(404).json({ message: 'Invalid pair code. No user found.' });
    }

    // Can't pair with yourself
    if (targetUser._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot pair with yourself!' });
    }

    // Admin can only pair with User and vice versa
    if (currentUser.role === targetUser.role) {
      return res.status(400).json({ 
        message: `Admin can only pair with User and vice versa. This code belongs to a ${targetUser.role}.` 
      });
    }

    // Check if already paired
    if (currentUser.pairedWith.includes(targetUser._id)) {
      return res.status(400).json({ message: 'Already paired with this user!' });
    }

    // Add pairing for both users (bidirectional)
    await User.findByIdAndUpdate(currentUser._id, { 
      $addToSet: { pairedWith: targetUser._id } 
    });
    await User.findByIdAndUpdate(targetUser._id, { 
      $addToSet: { pairedWith: currentUser._id } 
    });

    res.json({ 
      message: 'Successfully paired!',
      pairedUser: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        role: targetUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get list of paired users
// @route   GET /api/pair/users
exports.getPairedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('pairedWith', 'name email phone role pairCode');
    res.json(user.pairedWith);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Unpair from a user
// @route   DELETE /api/pair/:userId
exports.unpairUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const targetUserId = req.params.userId;

    await User.findByIdAndUpdate(currentUser._id, { 
      $pull: { pairedWith: targetUserId } 
    });
    await User.findByIdAndUpdate(targetUserId, { 
      $pull: { pairedWith: currentUser._id } 
    });

    res.json({ message: 'Successfully unpaired!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
