const express = require('express');
const router = express.Router();

// Announcements routes
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Announcements endpoint',
    data: []
  });
});

router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Create announcement endpoint',
    data: {}
  });
});

module.exports = router;
