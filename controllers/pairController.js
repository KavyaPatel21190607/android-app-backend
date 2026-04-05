const User = require('../models/User');

// @desc    User pairs with admin using admin's 6-digit code
// @route   POST /api/pair
exports.pairUsers = async (req, res) => {
  try {
    const { pairCode } = req.body;
    const currentUser = await User.findById(req.user._id);

    if (!pairCode) {
      return res.status(400).json({ message: 'Please enter a pair code' });
    }

    // Trim and clean the pair code
    const cleanCode = pairCode.toString().trim();
    
    console.log(`[PAIR] User "${currentUser.name}" (${currentUser.role}) attempting to pair with code: "${cleanCode}"`);

    // Only users can initiate pairing (they enter admin's code)
    if (currentUser.role !== 'user') {
      return res.status(400).json({ message: 'Only users can pair with an admin. Share your code with users instead.' });
    }

    // Find admin with this pair code - trim both sides for safety
    const admin = await User.findOne({ 
      pairCode: cleanCode, 
      role: 'admin' 
    });
    
    console.log(`[PAIR] Admin lookup result:`, admin ? `Found "${admin.name}" (${admin._id})` : 'NOT FOUND');

    // Also check if ANY user has this code (for better error messages)
    if (!admin) {
      const anyUser = await User.findOne({ pairCode: cleanCode });
      if (anyUser && anyUser.role === 'user') {
        return res.status(400).json({ message: 'This code belongs to a user, not an admin. You need to enter an admin\'s code.' });
      }
      return res.status(404).json({ message: 'Invalid code. No admin found with this pair code.' });
    }

    // Check if already paired
    if (currentUser.pairedWith && currentUser.pairedWith.some(id => id.toString() === admin._id.toString())) {
      return res.status(400).json({ message: 'You are already paired with this admin!' });
    }

    // Add pairing for both (bidirectional)
    await User.findByIdAndUpdate(currentUser._id, { 
      $addToSet: { pairedWith: admin._id } 
    });
    await User.findByIdAndUpdate(admin._id, { 
      $addToSet: { pairedWith: currentUser._id } 
    });

    console.log(`[PAIR] SUCCESS: User "${currentUser.name}" paired with Admin "${admin.name}"`);

    res.json({ 
      message: 'Successfully paired with ' + admin.name + '!',
      pairedUser: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('[PAIR] Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get list of paired users
// @route   GET /api/pair/users
exports.getPairedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('pairedWith', 'name email phone role pairCode');
    res.json(user.pairedWith || []);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Unpair from a user
// @route   DELETE /api/pair/:userId
exports.unpairUser = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    await User.findByIdAndUpdate(currentUserId, { 
      $pull: { pairedWith: targetUserId } 
    });
    await User.findByIdAndUpdate(targetUserId, { 
      $pull: { pairedWith: currentUserId } 
    });

    res.json({ message: 'Successfully unpaired!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Regenerate pair code for current user
// @route   POST /api/pair/regenerate-code
exports.regenerateCode = async (req, res) => {
  try {
    const generatePairCode = () => Math.floor(100000 + Math.random() * 900000).toString();
    
    let newCode = generatePairCode();
    while (await User.findOne({ pairCode: newCode })) {
      newCode = generatePairCode();
    }

    await User.findByIdAndUpdate(req.user._id, { pairCode: newCode });

    res.json({ message: 'Pair code regenerated!', pairCode: newCode });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
