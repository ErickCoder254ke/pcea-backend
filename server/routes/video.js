const express = require('express');
const router = express.Router();

// Video routes
router.get('/videos', (req, res) => {
  res.json({
    success: true,
    message: 'Videos endpoint',
    data: []
  });
});

router.post('/videos', (req, res) => {
  res.json({
    success: true,
    message: 'Create video endpoint',
    data: {}
  });
});

module.exports = router;
