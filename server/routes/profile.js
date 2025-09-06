const express = require('express');
const router = express.Router();

// Profile routes
router.get('/profile', (req, res) => {
  res.json({
    success: true,
    message: 'Profile endpoint',
    data: {}
  });
});

router.put('/profile', (req, res) => {
  res.json({
    success: true,
    message: 'Update profile endpoint',
    data: {}
  });
});

module.exports = router;
