const express = require('express');
const router = express.Router();

// Lyrics routes
router.get('/lyrics', (req, res) => {
  res.json({
    success: true,
    message: 'Lyrics endpoint',
    data: []
  });
});

router.post('/lyrics', (req, res) => {
  res.json({
    success: true,
    message: 'Create lyrics endpoint',
    data: {}
  });
});

module.exports = router;
