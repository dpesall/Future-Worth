const express = require('express');
const router = express.Router();

/**
 * GET /api/hello
 * Basic hello endpoint for testing API connectivity
 */
router.get('/hello', (req, res) => {
  try {
    res.json({
      message: 'Hello from FutureWorth API!',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Error in /hello endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/status
 * Returns API status and basic system information
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      status: 'operational',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      nodejs: process.version
    });
  } catch (error) {
    console.error('Error in /status endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/echo
 * Echo endpoint for testing POST requests
 */
router.post('/echo', (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    res.json({
      echo: message,
      timestamp: new Date().toISOString(),
      length: message.length
    });
  } catch (error) {
    console.error('Error in /echo endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;