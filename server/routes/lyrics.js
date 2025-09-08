const express = require('express');
const router = express.Router();
const Song = require('../models/Song');
const verifyToken = require('../../middlewares/auth');

// GET /api/lyrics - Get all published songs with optional filtering
router.get('/lyrics', async (req, res) => {
  try {
    const {
      category,
      theme,
      season,
      difficulty,
      language,
      search,
      featured,
      practiceList,
      limit = 50,
      skip = 0,
      sort = 'createdAt'
    } = req.query;

    let query = {
      status: 'published',
      'metadata.isActive': true
    };

    // Apply filters
    if (category) query.category = category;
    if (theme) query.theme = theme;
    if (season) query.season = season;
    if (difficulty) query.difficulty = difficulty;
    if (language) query.language = language;
    if (featured === 'true') query.featured = true;
    if (practiceList === 'true') query['practiceList.included'] = true;

    let songQuery;

    // Handle search
    if (search) {
      songQuery = Song.find({
        ...query,
        $text: { $search: search }
      }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 });
    } else {
      // Handle sorting
      let sortOption = {};
      switch (sort) {
        case 'title':
          sortOption = { title: 1 };
          break;
        case 'artist':
          sortOption = { artist: 1 };
          break;
        case 'popular':
          sortOption = { 'stats.timesUsed': -1, 'stats.favorites': -1 };
          break;
        case 'recent':
          sortOption = { createdAt: -1 };
          break;
        default:
          sortOption = { createdAt: -1 };
      }

      songQuery = Song.find(query).sort(sortOption);
    }

    const songs = await songQuery
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    // Get total count for pagination
    const total = await Song.countDocuments(query);

    res.json({
      success: true,
      data: songs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch songs',
      error: error.message
    });
  }
});

// GET /api/lyrics/:id - Get single song by ID
router.get('/lyrics/:id', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Increment view count for published songs
    if (song.status === 'published') {
      await song.incrementViews();
    }

    res.json({
      success: true,
      data: song
    });
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch song',
      error: error.message
    });
  }
});

// POST /api/lyrics - Create new song (Admin only)
router.post('/lyrics', verifyToken, async (req, res) => {
  try {
    const songData = {
      ...req.body,
      createdBy: req.userId
    };

    // Validate required fields
    if (!songData.title || !songData.artist) {
      return res.status(400).json({
        success: false,
        message: 'Title and artist are required'
      });
    }

    // Check for duplicate songs
    const existingSong = await Song.findOne({
      title: { $regex: new RegExp(`^${songData.title}$`, 'i') },
      artist: { $regex: new RegExp(`^${songData.artist}$`, 'i') },
      'metadata.isActive': true
    });

    if (existingSong) {
      return res.status(409).json({
        success: false,
        message: 'A song with this title and artist already exists'
      });
    }

    const song = new Song(songData);
    await song.save();

    const populatedSong = await Song.findById(song._id)
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Song created successfully',
      data: populatedSong
    });
  } catch (error) {
    console.error('Error creating song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create song',
      error: error.message
    });
  }
});

// PUT /api/lyrics/:id - Update song (Admin only)
router.put('/lyrics/:id', verifyToken, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Update song data
    Object.assign(song, req.body);
    song.updatedBy = req.userId;

    await song.save();

    const updatedSong = await Song.findById(song._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json({
      success: true,
      message: 'Song updated successfully',
      data: updatedSong
    });
  } catch (error) {
    console.error('Error updating song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update song',
      error: error.message
    });
  }
});

// DELETE /api/lyrics/:id - Delete song (Admin only)
router.delete('/lyrics/:id', verifyToken, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Soft delete by setting isActive to false
    song.metadata.isActive = false;
    song.updatedBy = req.userId;
    await song.save();

    res.json({
      success: true,
      message: 'Song deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete song',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/publish - Publish song (Admin only)
router.post('/lyrics/:id/publish', verifyToken, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    await song.publish(req.userId);

    const publishedSong = await Song.findById(song._id)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json({
      success: true,
      message: 'Song published successfully',
      data: publishedSong
    });
  } catch (error) {
    console.error('Error publishing song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish song',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/archive - Archive song (Admin only)
router.post('/lyrics/:id/archive', verifyToken, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    await song.archive();
    song.updatedBy = req.userId;
    await song.save();

    res.json({
      success: true,
      message: 'Song archived successfully'
    });
  } catch (error) {
    console.error('Error archiving song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive song',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/favorite - Toggle favorite (User action)
router.post('/lyrics/:id/favorite', async (req, res) => {
  try {
    const { action } = req.body; // 'add' or 'remove'
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    if (action === 'add') {
      await song.addToFavorites();
    } else if (action === 'remove') {
      await song.removeFromFavorites();
    }

    res.json({
      success: true,
      message: `Song ${action === 'add' ? 'added to' : 'removed from'} favorites`,
      data: {
        favorites: song.stats.favorites
      }
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle favorite',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/usage - Record song usage (Admin only)
router.post('/lyrics/:id/usage', verifyToken, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    await song.incrementUsage();

    res.json({
      success: true,
      message: 'Song usage recorded',
      data: {
        timesUsed: song.stats.timesUsed,
        lastUsed: song.usage.lastUsed
      }
    });
  } catch (error) {
    console.error('Error recording usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record usage',
      error: error.message
    });
  }
});

// GET /api/lyrics/categories - Get song categories with counts
router.get('/categories', async (req, res) => {
  try {
    const categories = await Song.aggregate([
      {
        $match: {
          status: 'published',
          'metadata.isActive': true
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// GET /api/lyrics/practice-list - Get current practice list
router.get('/practice-list', async (req, res) => {
  try {
    const { week } = req.query;
    const targetWeek = week ? new Date(week) : new Date();

    const practiceList = await Song.getPracticeList(targetWeek);

    res.json({
      success: true,
      data: practiceList,
      week: targetWeek
    });
  } catch (error) {
    console.error('Error fetching practice list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch practice list',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/practice-list - Add/Remove from practice list (Admin only)
router.post('/lyrics/:id/practice-list', verifyToken, async (req, res) => {
  try {
    const { action, week, priority, notes } = req.body;
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    if (action === 'add') {
      await song.addToPracticeList(week, priority, notes);
    } else if (action === 'remove') {
      await song.removeFromPracticeList();
    }

    res.json({
      success: true,
      message: `Song ${action === 'add' ? 'added to' : 'removed from'} practice list`,
      data: song.practiceList
    });
  } catch (error) {
    console.error('Error updating practice list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update practice list',
      error: error.message
    });
  }
});

// GET /api/lyrics/featured - Get featured songs
router.get('/featured', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const featuredSongs = await Song.getFeatured(parseInt(limit));

    res.json({
      success: true,
      data: featuredSongs
    });
  } catch (error) {
    console.error('Error fetching featured songs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured songs',
      error: error.message
    });
  }
});

// GET /api/lyrics/popular - Get popular songs
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const popularSongs = await Song.getPopular(parseInt(limit));

    res.json({
      success: true,
      data: popularSongs
    });
  } catch (error) {
    console.error('Error fetching popular songs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular songs',
      error: error.message
    });
  }
});

// GET /api/lyrics/recent - Get recently added songs
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const recentSongs = await Song.getRecentlyAdded(parseInt(limit));

    res.json({
      success: true,
      data: recentSongs
    });
  } catch (error) {
    console.error('Error fetching recent songs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent songs',
      error: error.message
    });
  }
});

// GET /api/lyrics/stats - Get song statistics (Admin only)
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const stats = await Song.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching song stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch song statistics',
      error: error.message
    });
  }
});

// POST /api/lyrics/:id/chords - Upload chord chart (Admin only)
router.post('/lyrics/:id/chords', verifyToken, async (req, res) => {
  try {
    const { publicId, url, format, size } = req.body;
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    song.chords.chart = {
      publicId,
      url,
      format,
      size
    };
    song.updatedBy = req.userId;
    await song.save();

    res.json({
      success: true,
      message: 'Chord chart uploaded successfully',
      data: song.chords.chart
    });
  } catch (error) {
    console.error('Error uploading chord chart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload chord chart',
      error: error.message
    });
  }
});

// GET /api/lyrics/admin - Get all songs for admin (Admin only)
router.get('/admin', verifyToken, async (req, res) => {
  try {
    const {
      status,
      category,
      limit = 50,
      skip = 0,
      sort = 'createdAt'
    } = req.query;

    let query = { 'metadata.isActive': true };
    if (status) query.status = status;
    if (category) query.category = category;

    let sortOption = {};
    switch (sort) {
      case 'title':
        sortOption = { title: 1 };
        break;
      case 'artist':
        sortOption = { artist: 1 };
        break;
      case 'status':
        sortOption = { status: 1, createdAt: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const songs = await Song.find(query)
      .sort(sortOption)
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email');

    const total = await Song.countDocuments(query);

    res.json({
      success: true,
      data: songs,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin songs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch songs for admin',
      error: error.message
    });
  }
});

module.exports = router;
