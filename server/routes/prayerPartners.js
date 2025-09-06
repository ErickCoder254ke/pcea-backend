const express = require('express');
const router = express.Router();

// Prayer Partners routes
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Prayer partners endpoint',
    data: []
  });
});

router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Create prayer partner endpoint',
    data: {}
  });
});

module.exports = router;
