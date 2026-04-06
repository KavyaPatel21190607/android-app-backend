const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT Token (valid for 30 days)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Generate unique 6-digit pair code
const generatePairCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @desc    Register a new user (Admin or User)
// @route   POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Please fill all fields' });
    }

    // Phone is required for ALL roles (users get reminder calls, admins get notification calls)
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required for all accounts' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Generate unique pair code
    let pairCode = generatePairCode();
    while (await User.findOne({ pairCode })) {
      pairCode = generatePairCode();
    }

    // Create user in database
    const user = await User.create({
      name, email, password, phone, role, pairCode
    });

    // Send response with token
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      pairCode: user.pairCode,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        pairCode: user.pairCode,
        pairedWith: user.pairedWith,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get logged-in user's profile
// @route   GET /api/auth/profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('pairedWith', 'name email phone role');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update logged-in user's profile
// @route   PUT /api/auth/profile
// Allowed: name, email, phone, password
// NOT allowed: role, pairCode
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, phone, password } = req.body;

    // Update name
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // Update email (check for duplicates)
    if (email && email.trim() && email.trim().toLowerCase() !== user.email) {
      const emailExists = await User.findOne({ email: email.trim().toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use by another account' });
      }
      user.email = email.trim().toLowerCase();
    }

    // Update phone
    if (phone !== undefined) {
      user.phone = phone.trim();
    }

    // Update password (will be auto-hashed by pre-save hook)
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      user.password = password;
    }

    await user.save();

    // Return updated user (without password)
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      pairCode: user.pairCode,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
