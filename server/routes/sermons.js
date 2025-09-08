const express = require('express');
const router = express.Router();
const Sermon = require('../models/Sermon');
const { verifyToken, optionalAuth } = require('../../middlewares/auth');

// Import upload handler for file uploads
// Note: Requires multer and cloudinary packages to be installed
// npm install multer cloudinary
try {
  const uploadHandler = require('./uploadHandler');
  router.use('/', uploadHandler);
} catch (error) {
  console.warn('Upload handler not available. Install multer and cloudinary for file upload functionality.');
}

// GET all sermons (public endpoint with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      speaker,
      series,
      status = 'published',
      featured, 
      limit = 20, 
      offset = 0, 
      search,
      sortBy = 'newest',
      tags,
      dateFrom,
      dateTo
    } = req.query;

    // Build query object
    let query = { isActive: true };

    // Only show published sermons for public access (unless user is authenticated admin)
    if (!req.user || req.user.role !== 'admin') {
      query.status = 'published';
    } else if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by category
    if (category && category !== 'all' && category !== 'All') {
      query.category = category;
    }

    // Filter by speaker
    if (speaker && speaker.trim()) {
      query['speaker.name'] = new RegExp(speaker.trim(), 'i');
    }

    // Filter by series
    if (series && series.trim()) {
      query['series.name'] = new RegExp(series.trim(), 'i');
    }

    // Filter by featured status
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    let sermonQuery;

    // Handle search
    if (search && search.trim()) {
      // Use text search if search query provided
      query.$text = { $search: search.trim() };
      sermonQuery = Sermon.find(query, { score: { $meta: 'textScore' } });
      
      // Sort by text score first, then by date
      if (sortBy === 'relevance') {
        sermonQuery.sort({ score: { $meta: 'textScore' }, publishedAt: -1 });
      } else {
        sermonQuery.sort({ score: { $meta: 'textScore' }, publishedAt: sortBy === 'oldest' ? 1 : -1 });
      }
    } else {
      sermonQuery = Sermon.find(query);
      
      // Apply sorting
      switch (sortBy) {
        case 'oldest':
          sermonQuery.sort({ publishedAt: 1 });
          break;
        case 'popular':
          sermonQuery.sort({ 'stats.views': -1, publishedAt: -1 });
          break;
        case 'liked':
          sermonQuery.sort({ 'stats.likes': -1, publishedAt: -1 });
          break;
        case 'speaker':
          sermonQuery.sort({ 'speaker.name': 1, publishedAt: -1 });
          break;
        case 'series':
          sermonQuery.sort({ 'series.name': 1, 'series.part': 1, publishedAt: -1 });
          break;
        case 'newest':
        default:
          sermonQuery.sort({ publishedAt: -1 });
          break;
      }
    }

    // Get total count for pagination
    const totalCount = await Sermon.countDocuments(query);

    // Apply pagination
    const startIndex = parseInt(offset) || 0;
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 items per request

    const sermons = await sermonQuery
      .skip(startIndex)
      .limit(limitNum)
      .populate('uploadedBy', 'name')
      .lean(); // Use lean() for better performance

    // Transform data for frontend compatibility
    const transformedSermons = sermons.map(sermon => ({
      id: sermon._id.toString(),
      title: sermon.title,
      description: sermon.description,
      speaker: sermon.speaker.name,
      speakerTitle: sermon.speaker.title,
      speakerBio: sermon.speaker.bio,
      speakerImageUrl: sermon.speaker.imageUrl,
      date: sermon.date,
      duration: sermon.duration,
      formattedDuration: sermon.duration ? `${sermon.duration} min` : null,
      category: sermon.category,
      topic: sermon.topic,
      series: sermon.series.name,
      seriesPart: sermon.series.part,
      seriesTotalParts: sermon.series.totalParts,
      scripture: sermon.scripture,
      tags: sermon.tags || [],
      featured: sermon.featured,
      imageUrl: sermon.media?.thumbnail?.url || '',
      fileUrl: sermon.media?.notes?.url || '',
      audioUrl: sermon.media?.audio?.url || '',
      videoUrl: sermon.media?.video?.url || '',
      views: sermon.stats?.views || 0,
      likes: sermon.stats?.likes || 0,
      downloads: sermon.stats?.downloads || 0,
      shares: sermon.stats?.shares || 0,
      uploadedAt: sermon.uploadedAt,
      publishedAt: sermon.publishedAt,
      status: sermon.status,
      isNew: sermon.publishedAt && new Date(sermon.publishedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      uploadedBy: sermon.uploadedBy ? {
        id: sermon.uploadedBy._id,
        name: sermon.uploadedBy.name
      } : null
    }));

    res.json({
      success: true,
      message: 'Sermons retrieved successfully',
      data: transformedSermons,
      pagination: {
        total: totalCount,
        offset: startIndex,
        limit: limitNum,
        hasMore: totalCount > startIndex + transformedSermons.length,
        page: Math.floor(startIndex / limitNum) + 1,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      meta: {
        query: { category, speaker, series, status, featured, search, sortBy, tags, dateFrom, dateTo },
        resultCount: transformedSermons.length
      }
    });
  } catch (error) {
    console.error('Error fetching sermons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermons',
      error: error.message
    });
  }
});

// GET single sermon (public with optional auth)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    let query = { _id: id, isActive: true };
    
    // Only show published sermons for public access
    if (!req.user || req.user.role !== 'admin') {
      query.status = 'published';
    }

    const sermon = await Sermon.findOne(query).populate('uploadedBy', 'name');

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    // Increment view count (async, don't wait)
    sermon.incrementViews().catch(err => {
      console.error('Error incrementing views:', err);
    });

    // Transform data for frontend
    const transformedSermon = {
      id: sermon._id.toString(),
      title: sermon.title,
      description: sermon.description,
      speaker: sermon.speaker.name,
      speakerTitle: sermon.speaker.title,
      speakerBio: sermon.speaker.bio,
      speakerImageUrl: sermon.speaker.imageUrl,
      date: sermon.date,
      duration: sermon.duration,
      formattedDuration: sermon.duration ? `${sermon.duration} min` : null,
      category: sermon.category,
      topic: sermon.topic,
      series: sermon.series.name,
      seriesPart: sermon.series.part,
      seriesTotalParts: sermon.series.totalParts,
      seriesInfo: sermon.seriesInfo, // Virtual field
      scripture: sermon.scripture,
      transcript: sermon.transcript,
      tags: sermon.tags,
      featured: sermon.featured,
      imageUrl: sermon.media?.thumbnail?.url || '',
      fileUrl: sermon.media?.notes?.url || '',
      audioUrl: sermon.media?.audio?.url || '',
      videoUrl: sermon.media?.video?.url || '',
      videoQuality: sermon.media?.video?.quality || '',
      views: sermon.stats.views,
      likes: sermon.stats.likes,
      downloads: sermon.stats.downloads,
      shares: sermon.stats.shares,
      uploadedAt: sermon.uploadedAt,
      publishedAt: sermon.publishedAt,
      updatedAt: sermon.updatedAt,
      status: sermon.status,
      metadata: sermon.metadata,
      uploadedBy: sermon.uploadedBy ? {
        id: sermon.uploadedBy._id,
        name: sermon.uploadedBy.name
      } : null
    };

    res.json({
      success: true,
      message: 'Sermon retrieved successfully',
      data: transformedSermon
    });
  } catch (error) {
    console.error('Error fetching sermon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermon',
      error: error.message
    });
  }
});

// POST new sermon (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      speaker,
      date,
      duration,
      category,
      topic,
      series,
      scripture,
      media,
      transcript,
      tags,
      featured = false,
      status = 'draft',
      metadata
    } = req.body;

    // Validation - only title is required for admin flexibility
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    // Optional field validation - validate only if provided
    if (duration && duration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be at least 1 minute if provided'
      });
    }

    // Create new sermon - handle optional fields gracefully
    const sermon = new Sermon({
      title: title.trim(),
      description: description?.trim() || '',
      speaker: {
        name: speaker?.name?.trim() || '',
        title: speaker?.title?.trim() || '',
        bio: speaker?.bio?.trim() || '',
        imageUrl: speaker?.imageUrl?.trim() || ''
      },
      date: date ? new Date(date) : null,
      duration: duration ? parseInt(duration) : null,
      category: category || 'Sunday Service',
      topic: topic?.trim() || '',
      series: {
        name: series?.name?.trim() || '',
        part: series?.part ? parseInt(series.part) : null,
        totalParts: series?.totalParts ? parseInt(series.totalParts) : null
      },
      scripture: scripture || { references: [], mainText: '' },
      media: media || {},
      transcript: transcript?.trim() || '',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
      featured: Boolean(featured),
      status: status,
      metadata: metadata || {},
      uploadedBy: req.user.id
    });

    const savedSermon = await sermon.save();
    
    // Populate uploadedBy for response
    await savedSermon.populate('uploadedBy', 'name');

    console.log(`✅ New sermon created: "${savedSermon.title}" by ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Sermon created successfully',
      data: {
        id: savedSermon._id.toString(),
        title: savedSermon.title,
        speaker: savedSermon.speaker.name,
        date: savedSermon.date,
        duration: savedSermon.duration,
        category: savedSermon.category,
        topic: savedSermon.topic,
        series: savedSermon.series.name,
        status: savedSermon.status,
        featured: savedSermon.featured,
        uploadedAt: savedSermon.uploadedAt,
        uploadedBy: savedSermon.uploadedBy ? {
          id: savedSermon.uploadedBy._id,
          name: savedSermon.uploadedBy.name
        } : null
      }
    });
  } catch (error) {
    console.error('Error creating sermon:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create sermon',
      error: error.message
    });
  }
});

// PUT update sermon (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Find the sermon
    const sermon = await Sermon.findById(id);

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    // Build update object (only update provided fields)
    const updateFields = {};
    
    if (updateData.title !== undefined) updateFields.title = updateData.title.trim();
    if (updateData.description !== undefined) updateFields.description = updateData.description.trim();
    if (updateData.speaker !== undefined) updateFields.speaker = updateData.speaker;
    if (updateData.date !== undefined) updateFields.date = new Date(updateData.date);
    if (updateData.duration !== undefined) updateFields.duration = parseInt(updateData.duration);
    if (updateData.category !== undefined) updateFields.category = updateData.category;
    if (updateData.topic !== undefined) updateFields.topic = updateData.topic.trim();
    if (updateData.series !== undefined) updateFields.series = updateData.series;
    if (updateData.scripture !== undefined) updateFields.scripture = updateData.scripture;
    if (updateData.media !== undefined) updateFields.media = updateData.media;
    if (updateData.transcript !== undefined) updateFields.transcript = updateData.transcript.trim();
    if (updateData.tags !== undefined) {
      updateFields.tags = Array.isArray(updateData.tags) ? 
        updateData.tags.map(tag => tag.trim().toLowerCase()) : [];
    }
    if (updateData.featured !== undefined) updateFields.featured = Boolean(updateData.featured);
    if (updateData.status !== undefined) updateFields.status = updateData.status;
    if (updateData.metadata !== undefined) updateFields.metadata = updateData.metadata;

    // Update the sermon
    const updatedSermon = await Sermon.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name');

    console.log(`✅ Sermon updated: "${updatedSermon.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Sermon updated successfully',
      data: {
        id: updatedSermon._id.toString(),
        title: updatedSermon.title,
        description: updatedSermon.description,
        speaker: updatedSermon.speaker,
        date: updatedSermon.date,
        duration: updatedSermon.duration,
        category: updatedSermon.category,
        topic: updatedSermon.topic,
        series: updatedSermon.series,
        scripture: updatedSermon.scripture,
        media: updatedSermon.media,
        transcript: updatedSermon.transcript,
        tags: updatedSermon.tags,
        featured: updatedSermon.featured,
        status: updatedSermon.status,
        stats: updatedSermon.stats,
        uploadedAt: updatedSermon.uploadedAt,
        updatedAt: updatedSermon.updatedAt,
        publishedAt: updatedSermon.publishedAt,
        metadata: updatedSermon.metadata,
        uploadedBy: updatedSermon.uploadedBy ? {
          id: updatedSermon.uploadedBy._id,
          name: updatedSermon.uploadedBy.name
        } : null
      }
    });
  } catch (error) {
    console.error('Error updating sermon:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update sermon',
      error: error.message
    });
  }
});

// DELETE sermon (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findById(id);

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    // Soft delete by setting isActive to false
    const deletedSermon = await Sermon.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    console.log(`🗑️ Sermon soft-deleted: "${deletedSermon.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Sermon deleted successfully',
      data: {
        id: deletedSermon._id.toString(),
        title: deletedSermon.title,
        deletedAt: deletedSermon.updatedAt
      }
    });
  } catch (error) {
    console.error('Error deleting sermon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sermon',
      error: error.message
    });
  }
});

// POST publish sermon (admin only)
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findById(id);
    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    await sermon.publish();

    console.log(`📢 Sermon published: "${sermon.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Sermon published successfully',
      data: {
        id: sermon._id.toString(),
        title: sermon.title,
        status: sermon.status,
        publishedAt: sermon.publishedAt
      }
    });
  } catch (error) {
    console.error('Error publishing sermon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish sermon',
      error: error.message
    });
  }
});

// POST toggle featured status (admin only)
router.post('/:id/toggle-featured', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findById(id);
    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    sermon.featured = !sermon.featured;
    await sermon.save();

    console.log(`⭐ Sermon "${sermon.title}" featured status: ${sermon.featured}`);

    res.json({
      success: true,
      message: `Sermon ${sermon.featured ? 'featured' : 'unfeatured'} successfully`,
      data: {
        id: sermon._id.toString(),
        title: sermon.title,
        featured: sermon.featured
      }
    });
  } catch (error) {
    console.error('Error toggling featured status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle featured status',
      error: error.message
    });
  }
});

// POST like/unlike sermon (public with optional auth)
router.post('/:id/like', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { increment = true } = req.body;

    const sermon = await Sermon.findOne({ _id: id, isActive: true, status: 'published' });
    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    await sermon.toggleLike(increment);

    res.json({
      success: true,
      message: `Sermon ${increment ? 'liked' : 'unliked'} successfully`,
      data: {
        id: sermon._id.toString(),
        title: sermon.title,
        likes: sermon.stats.likes
      }
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update like status',
      error: error.message
    });
  }
});

// POST increment download count
router.post('/:id/download', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findOne({ _id: id, isActive: true, status: 'published' });
    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    await sermon.incrementDownloads();

    res.json({
      success: true,
      message: 'Download count updated',
      data: {
        id: sermon._id.toString(),
        downloads: sermon.stats.downloads
      }
    });
  } catch (error) {
    console.error('Error incrementing download count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update download count',
      error: error.message
    });
  }
});

// POST increment share count
router.post('/:id/share', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findOne({ _id: id, isActive: true, status: 'published' });
    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Sermon not found'
      });
    }

    await sermon.incrementShares();

    res.json({
      success: true,
      message: 'Share count updated',
      data: {
        id: sermon._id.toString(),
        shares: sermon.stats.shares
      }
    });
  } catch (error) {
    console.error('Error incrementing share count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update share count',
      error: error.message
    });
  }
});

// GET sermon categories (public)
router.get('/admin/categories', async (req, res) => {
  try {
    const categories = await Sermon.distinct('category', { isActive: true, status: 'published' });
    
    // Get category counts
    const categoryCounts = await Sermon.aggregate([
      { $match: { isActive: true, status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      message: 'Sermon categories retrieved successfully',
      data: {
        categories: categories.sort(),
        counts: categoryCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Error fetching sermon categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermon categories',
      error: error.message
    });
  }
});

// GET sermon speakers (public)
router.get('/admin/speakers', async (req, res) => {
  try {
    const speakers = await Sermon.aggregate([
      { $match: { isActive: true, status: 'published' } },
      {
        $group: {
          _id: '$speaker.name',
          count: { $sum: 1 },
          title: { $first: '$speaker.title' },
          bio: { $first: '$speaker.bio' },
          imageUrl: { $first: '$speaker.imageUrl' },
          totalViews: { $sum: '$stats.views' },
          totalLikes: { $sum: '$stats.likes' },
          avgDuration: { $avg: '$duration' },
          latestSermon: { $max: '$publishedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      message: 'Sermon speakers retrieved successfully',
      data: speakers.map(speaker => ({
        name: speaker._id,
        title: speaker.title,
        bio: speaker.bio,
        imageUrl: speaker.imageUrl,
        sermonCount: speaker.count,
        totalViews: speaker.totalViews,
        totalLikes: speaker.totalLikes,
        avgDuration: Math.round(speaker.avgDuration),
        latestSermon: speaker.latestSermon
      }))
    });
  } catch (error) {
    console.error('Error fetching sermon speakers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermon speakers',
      error: error.message
    });
  }
});

// GET sermon series (public)
router.get('/admin/series', async (req, res) => {
  try {
    const series = await Sermon.aggregate([
      { 
        $match: { 
          isActive: true, 
          status: 'published',
          'series.name': { $ne: '' }
        } 
      },
      {
        $group: {
          _id: '$series.name',
          count: { $sum: 1 },
          totalViews: { $sum: '$stats.views' },
          totalLikes: { $sum: '$stats.likes' },
          maxPart: { $max: '$series.part' },
          avgDuration: { $avg: '$duration' },
          latestSermon: { $max: '$publishedAt' },
          speakers: { $addToSet: '$speaker.name' }
        }
      },
      { $sort: { latestSermon: -1 } }
    ]);

    res.json({
      success: true,
      message: 'Sermon series retrieved successfully',
      data: series.map(s => ({
        name: s._id,
        sermonCount: s.count,
        totalParts: s.maxPart,
        totalViews: s.totalViews,
        totalLikes: s.totalLikes,
        avgDuration: Math.round(s.avgDuration),
        latestSermon: s.latestSermon,
        speakers: s.speakers
      }))
    });
  } catch (error) {
    console.error('Error fetching sermon series:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermon series',
      error: error.message
    });
  }
});

// GET sermon statistics (admin only)
router.get('/admin/stats', verifyToken, async (req, res) => {
  try {
    const stats = await Sermon.getStats();
    
    res.json({
      success: true,
      message: 'Sermon statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching sermon stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sermon statistics',
      error: error.message
    });
  }
});

// GET recent sermons (public)
router.get('/admin/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const recentSermons = await Sermon.getRecent(parseInt(limit));
    
    const transformedSermons = recentSermons.map(sermon => ({
      id: sermon._id.toString(),
      title: sermon.title,
      speaker: sermon.speaker.name,
      date: sermon.date,
      publishedAt: sermon.publishedAt,
      duration: sermon.duration,
      views: sermon.stats.views,
      likes: sermon.stats.likes,
      category: sermon.category,
      series: sermon.series.name
    }));

    res.json({
      success: true,
      message: 'Recent sermons retrieved successfully',
      data: transformedSermons
    });
  } catch (error) {
    console.error('Error fetching recent sermons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent sermons',
      error: error.message
    });
  }
});

// GET featured sermons (public)
router.get('/admin/featured', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const featuredSermons = await Sermon.getFeatured(parseInt(limit));
    
    const transformedSermons = featuredSermons.map(sermon => ({
      id: sermon._id.toString(),
      title: sermon.title,
      speaker: sermon.speaker.name,
      date: sermon.date,
      publishedAt: sermon.publishedAt,
      duration: sermon.duration,
      views: sermon.stats.views,
      likes: sermon.stats.likes,
      category: sermon.category,
      series: sermon.series.name,
      imageUrl: sermon.media?.thumbnail?.url || '',
      description: sermon.description
    }));

    res.json({
      success: true,
      message: 'Featured sermons retrieved successfully',
      data: transformedSermons
    });
  } catch (error) {
    console.error('Error fetching featured sermons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve featured sermons',
      error: error.message
    });
  }
});

module.exports = router;
