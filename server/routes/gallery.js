const express = require('express');
const router = express.Router();

// Gallery routes
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Gallery endpoint',
    data: []
  });
});

router.post('/', (req, res) => {
  res.json({
    success: true,
    message: 'Create gallery item endpoint',
    data: {}
  });
});

module.exports = router;
