const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/auth');

// Mock data storage (in a real app, this would be a database)
let meditations = [
  {
    id: 1,
    week: "2025-W02",
    scripture: "Psalm 46:10 - Be still, and know that I am God.",
    reflection: "This verse calls us to pause and trust in God's sovereignty, even in the chaos of life. This week, take a moment each day to find stillness and reflect on His presence in your life.",
    prayer: "Heavenly Father, teach me to be still in Your presence and to trust You in all circumstances. Help me rest in the knowledge that You are in control. Amen.",
    isActive: true,
    scheduled: false,
    publishDate: "2025-01-06T06:00:00.000Z",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 2,
    week: "2025-W03",
    scripture: "Isaiah 41:10 - Fear not, for I am with you; be not dismayed, for I am your God.",
    reflection: "God promises to be with us in every situation. This week, meditate on His constant presence and let His assurance dispel any fear or worry.",
    prayer: "Lord, thank You for always being by my side. Strengthen me with Your presence and remind me that I am never alone. Amen.",
    isActive: true,
    scheduled: false,
    publishDate: "2025-01-13T06:00:00.000Z",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Helper function to get current week
const getCurrentWeek = () => {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};


// Root endpoint - Get all meditations (public, limited info)
router.get('/', (req, res) => {
  try {
    const { limit = 10, status = 'active' } = req.query;

    let filteredMeditations = [...meditations];

    // Filter by status for public endpoint
    if (status === 'active') {
      filteredMeditations = filteredMeditations.filter(m => m.isActive);
    }

    // Sort by week descending (most recent first)
    filteredMeditations.sort((a, b) => b.week.localeCompare(a.week));

    // Limit results
    const limitedMeditations = filteredMeditations.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: limitedMeditations,
      total: filteredMeditations.length
    });
  } catch (error) {
    console.error('Error fetching meditations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meditations'
    });
  }
});

// Public endpoint - Get current week's meditation
router.get('/weekly', (req, res) => {
  try {
    const currentWeek = getCurrentWeek();
    let meditation = meditations.find(m => m.week === currentWeek && m.isActive);

    if (!meditation) {
      // Find the most recent active meditation
      meditation = meditations
        .filter(m => m.isActive && m.week < currentWeek)
        .sort((a, b) => b.week.localeCompare(a.week))[0];

      if (!meditation) {
        return res.status(404).json({ 
          success: false,
          message: "No meditation verse available yet. Please check back later." 
        });
      }
    }

    res.status(200).json({
      success: true,
      data: meditation
    });
  } catch (error) {
    console.error('Error fetching weekly meditation:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred while fetching the weekly meditation.' 
    });
  }
});

// Admin endpoints

// Get all meditations (admin only)
router.get('/admin', verifyToken, (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all', sortBy = 'week', order = 'desc' } = req.query;
    
    let filteredMeditations = [...meditations];
    
    // Filter by status
    if (status !== 'all') {
      filteredMeditations = filteredMeditations.filter(m => {
        if (status === 'active') return m.isActive;
        if (status === 'inactive') return !m.isActive;
        if (status === 'scheduled') return m.scheduled;
        return true;
      });
    }
    
    // Sort meditations
    filteredMeditations.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'week') {
        comparison = a.week.localeCompare(b.week);
      } else if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt) - new Date(b.createdAt);
      } else if (sortBy === 'updatedAt') {
        comparison = new Date(a.updatedAt) - new Date(b.updatedAt);
      }
      return order === 'desc' ? -comparison : comparison;
    });
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedMeditations = filteredMeditations.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedMeditations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filteredMeditations.length / limit),
        totalItems: filteredMeditations.length,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching meditations for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meditations'
    });
  }
});

// Get meditation statistics (admin only)
router.get('/admin/stats', verifyToken, (req, res) => {
  try {
    const currentWeek = getCurrentWeek();
    const total = meditations.length;
    const active = meditations.filter(m => m.isActive).length;
    const scheduled = meditations.filter(m => m.scheduled).length;
    const currentMeditation = meditations.find(m => m.week === currentWeek);
    
    res.json({
      success: true,
      data: {
        overview: {
          total,
          active,
          inactive: total - active,
          scheduled,
          currentWeek,
          hasCurrentWeek: !!currentMeditation
        },
        recentActivity: meditations
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 5)
          .map(m => ({
            id: m.id,
            week: m.week,
            scripture: m.scripture.substring(0, 50) + '...',
            updatedAt: m.updatedAt,
            isActive: m.isActive
          }))
      }
    });
  } catch (error) {
    console.error('Error fetching meditation statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meditation statistics'
    });
  }
});

// Create new meditation (admin only)
router.post('/', verifyToken, (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { week, scripture, reflection, prayer, isActive = true, scheduled = false, publishDate } = req.body;
    
    // Validation
    if (!week || !scripture || !reflection || !prayer) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: week, scripture, reflection, prayer'
      });
    }
    
    // Check if meditation for this week already exists
    const existingMeditation = meditations.find(m => m.week === week);
    if (existingMeditation) {
      return res.status(409).json({
        success: false,
        message: `Meditation for week ${week} already exists`
      });
    }
    
    // Generate new ID
    const newId = Math.max(...meditations.map(m => m.id), 0) + 1;
    
    const newMeditation = {
      id: newId,
      week,
      scripture,
      reflection,
      prayer,
      isActive,
      scheduled,
      publishDate: publishDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    meditations.push(newMeditation);
    
    res.status(201).json({
      success: true,
      message: 'Meditation created successfully',
      data: newMeditation
    });
  } catch (error) {
    console.error('Error creating meditation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create meditation'
    });
  }
});

// Get specific meditation by ID (admin only)
router.get('/:id', verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const meditation = meditations.find(m => m.id === parseInt(id));
    
    if (!meditation) {
      return res.status(404).json({
        success: false,
        message: 'Meditation not found'
      });
    }
    
    res.json({
      success: true,
      data: meditation
    });
  } catch (error) {
    console.error('Error fetching meditation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meditation'
    });
  }
});

// Update meditation (admin only)
router.put('/:id', verifyToken, (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { id } = req.params;
    const { week, scripture, reflection, prayer, isActive, scheduled, publishDate } = req.body;
    
    const meditationIndex = meditations.findIndex(m => m.id === parseInt(id));
    
    if (meditationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Meditation not found'
      });
    }
    
    // Check if changing week conflicts with another meditation
    if (week && week !== meditations[meditationIndex].week) {
      const existingMeditation = meditations.find(m => m.week === week && m.id !== parseInt(id));
      if (existingMeditation) {
        return res.status(409).json({
          success: false,
          message: `Another meditation for week ${week} already exists`
        });
      }
    }
    
    // Update meditation
    const updatedMeditation = {
      ...meditations[meditationIndex],
      ...(week && { week }),
      ...(scripture && { scripture }),
      ...(reflection && { reflection }),
      ...(prayer && { prayer }),
      ...(isActive !== undefined && { isActive }),
      ...(scheduled !== undefined && { scheduled }),
      ...(publishDate && { publishDate }),
      updatedAt: new Date().toISOString()
    };
    
    meditations[meditationIndex] = updatedMeditation;
    
    res.json({
      success: true,
      message: 'Meditation updated successfully',
      data: updatedMeditation
    });
  } catch (error) {
    console.error('Error updating meditation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meditation'
    });
  }
});

// Delete meditation (admin only)
router.delete('/:id', verifyToken, (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { id } = req.params;
    const meditationIndex = meditations.findIndex(m => m.id === parseInt(id));
    
    if (meditationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Meditation not found'
      });
    }
    
    const deletedMeditation = meditations.splice(meditationIndex, 1)[0];
    
    res.json({
      success: true,
      message: 'Meditation deleted successfully',
      data: deletedMeditation
    });
  } catch (error) {
    console.error('Error deleting meditation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete meditation'
    });
  }
});

// Schedule meditation for specific week (admin only)
router.post('/:id/schedule', verifyToken, (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { id } = req.params;
    const { publishDate, reminderSettings, weeklyRecurrence } = req.body;
    
    const meditationIndex = meditations.findIndex(m => m.id === parseInt(id));
    
    if (meditationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Meditation not found'
      });
    }
    
    // Update meditation with schedule information
    meditations[meditationIndex] = {
      ...meditations[meditationIndex],
      scheduled: true,
      publishDate: publishDate || new Date().toISOString(),
      reminderSettings,
      weeklyRecurrence,
      updatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Meditation scheduled successfully',
      data: meditations[meditationIndex]
    });
  } catch (error) {
    console.error('Error scheduling meditation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule meditation'
    });
  }
});

// Get meditation templates (admin only)
router.get('/admin/templates', verifyToken, (req, res) => {
  try {
    const templates = [
      {
        id: 1,
        name: 'Comfort & Peace',
        category: 'comfort',
        scriptureExample: 'Psalm 23:1 - The Lord is my shepherd, I lack nothing.',
        reflectionTemplate: 'This verse reminds us of God\'s care and provision. This week, reflect on how God has been your shepherd, guiding and protecting you through...',
        prayerTemplate: 'Loving Father, thank You for being my shepherd. Help me to trust in Your guidance and find peace in Your presence. Amen.',
        tags: ['comfort', 'peace', 'guidance']
      },
      {
        id: 2,
        name: 'Strength & Courage',
        category: 'strength',
        scriptureExample: 'Joshua 1:9 - Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.',
        reflectionTemplate: 'God calls us to be strong and courageous because He is with us. This week, consider the challenges you face and how God\'s presence gives you strength to...',
        prayerTemplate: 'Mighty God, give me strength and courage for the challenges ahead. Help me to remember that You are with me always. Amen.',
        tags: ['strength', 'courage', 'presence']
      },
      {
        id: 3,
        name: 'Love & Compassion',
        category: 'love',
        scriptureExample: '1 John 4:16 - And so we know and rely on the love God has for us. God is love. Whoever lives in love lives in God, and God in them.',
        reflectionTemplate: 'God\'s love is the foundation of our faith. This week, meditate on how deeply God loves you and how you can share that love with others by...',
        prayerTemplate: 'God of love, thank You for Your unfailing love. Help me to live in Your love and share it with others. Amen.',
        tags: ['love', 'compassion', 'relationships']
      }
    ];
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching meditation templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meditation templates'
    });
  }
});

// Bulk operations (admin only)
router.post('/admin/bulk', verifyToken, (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const { action, meditationIds, data } = req.body;
    
    if (!action || !meditationIds || !Array.isArray(meditationIds)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: action, meditationIds'
      });
    }
    
    let updatedCount = 0;
    const results = [];
    
    switch (action) {
      case 'activate':
        meditationIds.forEach(id => {
          const index = meditations.findIndex(m => m.id === parseInt(id));
          if (index !== -1) {
            meditations[index].isActive = true;
            meditations[index].updatedAt = new Date().toISOString();
            updatedCount++;
            results.push(meditations[index]);
          }
        });
        break;
        
      case 'deactivate':
        meditationIds.forEach(id => {
          const index = meditations.findIndex(m => m.id === parseInt(id));
          if (index !== -1) {
            meditations[index].isActive = false;
            meditations[index].updatedAt = new Date().toISOString();
            updatedCount++;
            results.push(meditations[index]);
          }
        });
        break;
        
      case 'delete':
        meditationIds.forEach(id => {
          const index = meditations.findIndex(m => m.id === parseInt(id));
          if (index !== -1) {
            const deleted = meditations.splice(index, 1)[0];
            updatedCount++;
            results.push(deleted);
          }
        });
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Supported actions: activate, deactivate, delete'
        });
    }
    
    res.json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      data: {
        updatedCount,
        results
      }
    });
  } catch (error) {
    console.error('Error performing bulk operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk operation'
    });
  }
});

module.exports = router;
