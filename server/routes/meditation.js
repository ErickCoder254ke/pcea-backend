const express = require('express');
const router = express.Router();

// Meditation routes
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Meditation endpoint',
    data: []
  });
});

router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Create meditation endpoint',
    data: {}
  });
});

module.exports = router;
