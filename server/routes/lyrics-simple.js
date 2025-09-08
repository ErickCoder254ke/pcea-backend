const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../../middlewares/auth');

// Simplified Song Schema for easier creation
const simpleSongSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  artist: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  category: {
    type: String,
    enum: ['hymns', 'contemporary', 'worship', 'seasonal', 'gospel', 'traditional', 'youth', 'children'],
    default: 'contemporary'
  },
  theme: {
    type: String,
    enum: ['praise', 'worship', 'salvation', 'grace', 'love', 'faith', 'hope', 'peace', 'joy', 'thanksgiving', 'christmas', 'easter', 'harvest', 'baptism', 'communion', 'prayer', 'healing', 'guidance', 'comfort', 'evangelism', 'dedication', 'other'],
    default: 'worship'
  },
  season: {
    type: String,
    enum: ['general', 'christmas', 'easter', 'advent', 'lent', 'pentecost', 'harvest', 'new_year', 'other'],
    default: 'general'
  },
  keySignature: {
    type: String,
    default: 'C Major'
  },
  tempo: {
    type: String,
    enum: ['slow', 'medium', 'fast'],
    default: 'medium'
  },
  lyrics: [{
    type: {
      type: String,
      enum: ['verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'intro'],
      default: 'verse'
    },
    label: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      default: 1
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  chords: [{
    type: String,
    trim: true
  }],
  language: {
    type: String,
    enum: ['english', 'kikuyu', 'swahili', 'other'],
    default: 'english'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create the model
const SimpleSong = mongoose.model('SimpleSong', simpleSongSchema);

// GET /api/lyrics-simple - Get all songs with simplified structure
router.get('/', async (req, res) => {
  try {
    const {
      category,
      search,
      limit = 50,
      skip = 0,
      status = 'published'
    } = req.query;

    let query = {};
    
    // Apply filters
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const songs = await SimpleSong.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    const total = await SimpleSong.countDocuments(query);

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

// GET /api/lyrics-simple/admin - Get all songs for admin (all statuses)
router.get('/admin', verifyToken, async (req, res) => {
  try {
    const {
      category,
      search,
      limit = 100,
      skip = 0,
      status
    } = req.query;

    let query = {};
    
    // Apply filters
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { artist: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const songs = await SimpleSong.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    const total = await SimpleSong.countDocuments(query);

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

// GET /api/lyrics-simple/stats - Get statistics (MUST be before /:id route)
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const totalSongs = await SimpleSong.countDocuments();
    const publishedSongs = await SimpleSong.countDocuments({ status: 'published' });
    const draftSongs = await SimpleSong.countDocuments({ status: 'draft' });
    const featuredSongs = await SimpleSong.countDocuments({ featured: true });

    // Category breakdown
    const categories = await SimpleSong.aggregate([
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
      data: {
        overview: {
          totalSongs,
          publishedSongs,
          draftSongs,
          featuredSongs
        },
        categories
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// POST /api/lyrics-simple/:id/publish - Publish song (MUST be before /:id route)
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const song = await SimpleSong.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    song.status = 'published';
    song.updatedBy = req.user.id;
    song.updatedAt = new Date();

    await song.save();

    const publishedSong = await SimpleSong.findById(song._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

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

// GET /api/lyrics-simple/:id - Get single song
router.get('/:id', async (req, res) => {
  try {
    const song = await SimpleSong.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
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

// POST /api/lyrics-simple - Create new song
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      artist,
      category,
      theme,
      season,
      keySignature,
      tempo,
      lyrics,
      tags,
      chords,
      language,
      status,
      featured
    } = req.body;

    // Validate required fields
    if (!title || !artist) {
      return res.status(400).json({
        success: false,
        message: 'Title and artist are required'
      });
    }

    // Validate lyrics
    if (!lyrics || lyrics.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one lyrics section is required'
      });
    }

    // Filter out empty lyrics sections
    const validLyrics = lyrics.filter(lyric => 
      lyric.text && lyric.text.trim() && lyric.label && lyric.label.trim()
    );

    if (validLyrics.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one lyrics section with content is required'
      });
    }

    // Create song data
    const songData = {
      title: title.trim(),
      artist: artist.trim(),
      category: category || 'contemporary',
      theme: theme || 'worship',
      season: season || 'general',
      keySignature: keySignature || 'C Major',
      tempo: tempo || 'medium',
      lyrics: validLyrics.map((lyric, index) => ({
        type: lyric.type || 'verse',
        label: lyric.label.trim(),
        text: lyric.text.trim(),
        order: lyric.order || index + 1
      })),
      tags: tags ? tags.filter(tag => tag && tag.trim()).map(tag => tag.trim().toLowerCase()) : [],
      chords: chords ? chords.filter(chord => chord && chord.trim()).map(chord => chord.trim()) : [],
      language: language || 'english',
      status: status || 'draft',
      featured: featured || false,
      createdBy: req.user.id,
      updatedBy: req.user.id
    };

    // Create the song
    const song = new SimpleSong(songData);
    await song.save();

    // Populate and return
    const populatedSong = await SimpleSong.findById(song._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    console.log(`✅ Song created successfully: ${title} by ${artist}`);

    res.status(201).json({
      success: true,
      message: 'Song created successfully',
      data: populatedSong
    });
  } catch (error) {
    console.error('Error creating song:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create song',
      error: error.message
    });
  }
});

// PUT /api/lyrics-simple/:id - Update song
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const song = await SimpleSong.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    const {
      title,
      artist,
      category,
      theme,
      season,
      keySignature,
      tempo,
      lyrics,
      tags,
      chords,
      language,
      status,
      featured
    } = req.body;

    // Update fields if provided
    if (title) song.title = title.trim();
    if (artist) song.artist = artist.trim();
    if (category) song.category = category;
    if (theme) song.theme = theme;
    if (season) song.season = season;
    if (keySignature) song.keySignature = keySignature;
    if (tempo) song.tempo = tempo;
    if (language) song.language = language;
    if (status) song.status = status;
    if (featured !== undefined) song.featured = featured;

    // Update lyrics if provided
    if (lyrics) {
      const validLyrics = lyrics.filter(lyric => 
        lyric.text && lyric.text.trim() && lyric.label && lyric.label.trim()
      );
      
      if (validLyrics.length > 0) {
        song.lyrics = validLyrics.map((lyric, index) => ({
          type: lyric.type || 'verse',
          label: lyric.label.trim(),
          text: lyric.text.trim(),
          order: lyric.order || index + 1
        }));
      }
    }

    // Update tags if provided
    if (tags) {
      song.tags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim().toLowerCase());
    }

    // Update chords if provided
    if (chords) {
      song.chords = chords.filter(chord => chord && chord.trim()).map(chord => chord.trim());
    }

    song.updatedBy = req.user.id;
    song.updatedAt = new Date();

    await song.save();

    // Populate and return
    const updatedSong = await SimpleSong.findById(song._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

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

// DELETE /api/lyrics-simple/:id - Delete song
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const song = await SimpleSong.findById(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    await SimpleSong.findByIdAndDelete(req.params.id);

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


// TEST ENDPOINT - Create sample song for debugging (remove in production)
router.post('/test/create-sample', verifyToken, async (req, res) => {
  try {
    console.log('🧪 Creating sample song for testing...');

    const sampleSong = new SimpleSong({
      title: 'Test Song ' + new Date().getTime(),
      artist: 'Test Artist',
      category: 'contemporary',
      theme: 'worship',
      season: 'general',
      keySignature: 'C Major',
      tempo: 'medium',
      lyrics: [
        {
          type: 'verse',
          label: 'Verse 1',
          text: 'This is a test song\nCreated for debugging\nIt should appear in the system',
          order: 1
        },
        {
          type: 'chorus',
          label: 'Chorus',
          text: 'Test song, test song\nEverything works fine\nTest song, test song\nIn perfect time',
          order: 2
        }
      ],
      tags: ['test', 'sample', 'debug'],
      chords: ['C', 'Am', 'F', 'G'],
      language: 'english',
      status: 'published',
      featured: false,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    await sampleSong.save();
    console.log('✅ Sample song created successfully:', sampleSong._id);

    const populatedSong = await SimpleSong.findById(sampleSong._id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    res.json({
      success: true,
      message: 'Sample song created successfully',
      data: populatedSong
    });
  } catch (error) {
    console.error('❌ Error creating sample song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sample song',
      error: error.message
    });
  }
});

// TEST ENDPOINT - Get debug info (remove in production)
router.get('/test/debug', async (req, res) => {
  try {
    const totalSongs = await SimpleSong.countDocuments();
    const publishedSongs = await SimpleSong.countDocuments({ status: 'published' });
    const draftSongs = await SimpleSong.countDocuments({ status: 'draft' });

    const sampleSongs = await SimpleSong.find().limit(3).select('title artist status createdAt');

    res.json({
      success: true,
      debug: {
        modelName: 'SimpleSong',
        mongoConnection: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        counts: {
          total: totalSongs,
          published: publishedSongs,
          draft: draftSongs
        },
        sampleSongs,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error in debug endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Debug endpoint failed',
      error: error.message
    });
  }
});

module.exports = router;
