const express = require('express');
const router = express.Router();

// Sermons routes
router.get('/sermons', (req, res) => {
  res.json({
    success: true,
    message: 'Sermons endpoint',
    data: []
  });
});

router.post('/sermons', (req, res) => {
  res.json({
    success: true,
    message: 'Create sermon endpoint',
    data: {}
  });
});

module.exports = router;
