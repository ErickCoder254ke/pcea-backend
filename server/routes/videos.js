const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { verifyToken, optionalAuth } = require('../../middlewares/auth');

// Import upload handler for file uploads
let uploadHandler = null;
try {
  uploadHandler = require('./uploadHandler');
} catch (error) {
  console.warn('Upload handler not available. Install multer and cloudinary for file upload functionality.');
}

// GET /api/videos - Public endpoint to get videos
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      speaker, 
      featured, 
      search, 
      limit = 20, 
      offset = 0,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      status = 'published'
    } = req.query;

    console.log('📹 Fetching videos with params:', {
      category, speaker, featured, search, limit, offset, sortBy, sortOrder, status
    });

    let query = { isActive: true };
    
    // Only admins can see draft/archived videos
    if (req.user && req.user.isAdmin && status === 'all') {
      // Admin can see all videos
    } else {
      query.status = 'published';
    }

    // Apply filters
    if (category && category !== 'all') {
      query.category = category;
    }

    if (speaker) {
      query['speaker.name'] = new RegExp(speaker, 'i');
    }

    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const videos = await Video.find(query)
      .sort(sortObj)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('uploadedBy', 'name email')
      .lean();

    // Get total count for pagination
    const totalCount = await Video.countDocuments(query);

    // Transform data for frontend
    const transformedVideos = videos.map(video => ({
      id: video._id,
      title: video.title,
      description: video.description,
      category: video.category,
      tags: video.tags,
      speaker: video.speaker,
      duration: video.duration,
      formattedDuration: video.duration ? 
        (video.duration >= 60 ? `${Math.floor(video.duration / 60)}h ${video.duration % 60}m` : `${video.duration}m`) : 
        'Unknown',
      featured: video.featured,
      stats: video.stats,
      uploadedBy: video.uploadedBy,
      uploadedAt: video.uploadedAt,
      publishedAt: video.publishedAt,
      status: video.status,
      // Video source information
      source: video.source,
      videoUrl: video.source?.type === 'upload' ? video.source.cloudinary?.url : video.source?.externalUrl,
      thumbnailUrl: video.source?.type === 'upload' ? 
        video.source.cloudinary?.thumbnailUrl : 
        video.source?.customThumbnail?.url,
      metadata: video.metadata
    }));

    console.log(`✅ Retrieved ${transformedVideos.length} videos`);

    res.json({
      success: true,
      data: transformedVideos,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });

  } catch (error) {
    console.error('❌ Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
});

// GET /api/videos/featured - Get featured videos
router.get('/featured', async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const videos = await Video.getFeatured(parseInt(limit));
    
    const transformedVideos = videos.map(video => ({
      id: video._id,
      title: video.title,
      description: video.description,
      category: video.category,
      speaker: video.speaker,
      duration: video.duration,
      formattedDuration: video.formattedDuration,
      stats: video.stats,
      publishedAt: video.publishedAt,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl
    }));

    res.json({
      success: true,
      data: transformedVideos
    });

  } catch (error) {
    console.error('❌ Error fetching featured videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured videos',
      error: error.message
    });
  }
});

// GET /api/videos/stats - Get video statistics (admin only)
router.get('/admin/stats', verifyToken, async (req, res) => {
  try {
    console.log('📊 Fetching video statistics...');

    const stats = await Video.getStats();

    console.log('✅ Video statistics retrieved:', stats.overview);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching video stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video statistics',
      error: error.message
    });
  }
});

// GET /api/videos/:id - Get specific video
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const video = await Video.findOne({ 
      _id: id, 
      isActive: true 
    }).populate('uploadedBy', 'name email');

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Check if user can view this video
    if (video.status !== 'published' && (!req.user || !req.user.isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'Video not available'
      });
    }

    // Increment view count (async, don't wait)
    if (video.status === 'published') {
      video.incrementViews().catch(err => 
        console.warn('Failed to increment views:', err.message)
      );
    }

    // Transform data for frontend
    const transformedVideo = {
      id: video._id,
      title: video.title,
      description: video.description,
      category: video.category,
      tags: video.tags,
      speaker: video.speaker,
      duration: video.duration,
      formattedDuration: video.formattedDuration,
      featured: video.featured,
      stats: video.stats,
      uploadedBy: video.uploadedBy,
      uploadedAt: video.uploadedAt,
      publishedAt: video.publishedAt,
      status: video.status,
      source: video.source,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      metadata: video.metadata
    };

    res.json({
      success: true,
      data: transformedVideo
    });

  } catch (error) {
    console.error('❌ Error fetching video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video',
      error: error.message
    });
  }
});

// POST /api/videos - Create new video (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      tags,
      speaker,
      duration,
      featured = false,
      source,
      status = 'published'
    } = req.body;

    console.log('📹 Creating new video:', { title, category, source: source?.type });

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    if (!source || !source.type || !['upload', 'url'].includes(source.type)) {
      return res.status(400).json({
        success: false,
        message: 'Valid source information is required'
      });
    }

    // Validate source-specific requirements
    if (source.type === 'upload' && (!source.cloudinary || !source.cloudinary.url || !source.cloudinary.publicId)) {
      return res.status(400).json({
        success: false,
        message: 'Cloudinary video data is required for uploaded videos'
      });
    }

    if (source.type === 'url' && !source.externalUrl) {
      return res.status(400).json({
        success: false,
        message: 'External URL is required for URL-based videos'
      });
    }

    // Create video document
    const videoData = {
      title: title.trim(),
      description: description?.trim() || '',
      category: category || 'Other',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
      speaker: {
        name: speaker?.name?.trim() || '',
        title: speaker?.title?.trim() || ''
      },
      duration: duration || null,
      featured: Boolean(featured),
      source: source,
      status: status,
      uploadedBy: req.user._id
    };

    const newVideo = new Video(videoData);
    const savedVideo = await newVideo.save();

    console.log('✅ Video created successfully:', savedVideo._id);

    // Return the created video
    const populatedVideo = await Video.findById(savedVideo._id)
      .populate('uploadedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Video created successfully',
      data: {
        id: populatedVideo._id,
        title: populatedVideo.title,
        description: populatedVideo.description,
        category: populatedVideo.category,
        tags: populatedVideo.tags,
        speaker: populatedVideo.speaker,
        duration: populatedVideo.duration,
        featured: populatedVideo.featured,
        stats: populatedVideo.stats,
        uploadedBy: populatedVideo.uploadedBy,
        uploadedAt: populatedVideo.uploadedAt,
        publishedAt: populatedVideo.publishedAt,
        status: populatedVideo.status,
        source: populatedVideo.source,
        videoUrl: populatedVideo.videoUrl,
        thumbnailUrl: populatedVideo.thumbnailUrl
      }
    });

  } catch (error) {
    console.error('❌ Error creating video:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A video with this information already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create video',
      error: error.message
    });
  }
});

// PUT /api/videos/:id - Update video (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      tags,
      speaker,
      duration,
      featured,
      source,
      status
    } = req.body;

    console.log('📹 Updating video:', id);

    const video = await Video.findOne({ _id: id, isActive: true });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Update fields
    if (title !== undefined) video.title = title.trim();
    if (description !== undefined) video.description = description.trim();
    if (category !== undefined) video.category = category;
    if (tags !== undefined) video.tags = Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [];
    if (speaker !== undefined) {
      video.speaker = {
        name: speaker?.name?.trim() || '',
        title: speaker?.title?.trim() || ''
      };
    }
    if (duration !== undefined) video.duration = duration;
    if (featured !== undefined) video.featured = Boolean(featured);
    if (source !== undefined) video.source = source;
    if (status !== undefined) video.status = status;

    const updatedVideo = await video.save();

    console.log('✅ Video updated successfully:', updatedVideo._id);

    res.json({
      success: true,
      message: 'Video updated successfully',
      data: {
        id: updatedVideo._id,
        title: updatedVideo.title,
        description: updatedVideo.description,
        category: updatedVideo.category,
        tags: updatedVideo.tags,
        speaker: updatedVideo.speaker,
        duration: updatedVideo.duration,
        featured: updatedVideo.featured,
        stats: updatedVideo.stats,
        uploadedAt: updatedVideo.uploadedAt,
        updatedAt: updatedVideo.updatedAt,
        publishedAt: updatedVideo.publishedAt,
        status: updatedVideo.status,
        source: updatedVideo.source,
        videoUrl: updatedVideo.videoUrl,
        thumbnailUrl: updatedVideo.thumbnailUrl
      }
    });

  } catch (error) {
    console.error('❌ Error updating video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video',
      error: error.message
    });
  }
});

// DELETE /api/videos/:id - Delete video (admin only) - Soft delete
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting video:', id);

    const video = await Video.findOne({ _id: id, isActive: true });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Soft delete
    video.isActive = false;
    video.status = 'archived';
    await video.save();

    console.log('✅ Video deleted successfully:', id);

    // Note: In production, you should also delete the file from Cloudinary
    // This requires implementing server-side Cloudinary deletion

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message
    });
  }
});

// POST /api/videos/:id/like - Toggle like on video
router.post('/:id/like', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { increment = true } = req.body;

    const video = await Video.findOne({ 
      _id: id, 
      isActive: true, 
      status: 'published' 
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    await video.toggleLike(increment);

    res.json({
      success: true,
      message: increment ? 'Video liked' : 'Like removed',
      data: {
        likes: video.stats.likes
      }
    });

  } catch (error) {
    console.error('❌ Error toggling video like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update like',
      error: error.message
    });
  }
});

// POST /api/videos/:id/share - Track video share
router.post('/:id/share', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const video = await Video.findOne({ 
      _id: id, 
      isActive: true, 
      status: 'published' 
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    await video.incrementShares();

    res.json({
      success: true,
      message: 'Share tracked',
      data: {
        shares: video.stats.shares
      }
    });

  } catch (error) {
    console.error('❌ Error tracking video share:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track share',
      error: error.message
    });
  }
});

// POST /api/videos/bulk - Bulk create videos (admin only)
router.post('/bulk', verifyToken, async (req, res) => {
  try {
    const { videos } = req.body;

    if (!Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Videos array is required'
      });
    }

    console.log(`📹 Creating ${videos.length} videos in bulk...`);

    const results = [];
    const errors = [];

    for (let i = 0; i < videos.length; i++) {
      const videoData = videos[i];
      
      try {
        // Validate each video
        if (!videoData.title) {
          errors.push(`Video ${i + 1}: Title is required`);
          continue;
        }

        if (!videoData.source || !videoData.source.type) {
          errors.push(`Video ${i + 1}: Valid source information is required`);
          continue;
        }

        // Create video
        const newVideo = new Video({
          ...videoData,
          title: videoData.title.trim(),
          description: videoData.description?.trim() || '',
          tags: Array.isArray(videoData.tags) ? videoData.tags.map(tag => tag.trim().toLowerCase()) : [],
          uploadedBy: req.user._id
        });

        const savedVideo = await newVideo.save();
        results.push({
          id: savedVideo._id,
          title: savedVideo.title
        });

      } catch (error) {
        console.error(`Error creating video ${i + 1}:`, error);
        if (error.code === 11000) {
          errors.push(`Video ${i + 1}: Duplicate video information`);
        } else {
          errors.push(`Video ${i + 1}: ${error.message}`);
        }
      }
    }

    console.log(`✅ Bulk video creation completed. Created: ${results.length}, Errors: ${errors.length}`);

    res.json({
      success: true,
      message: `Processed ${videos.length} videos. Created: ${results.length}, Errors: ${errors.length}`,
      data: {
        created: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk video creation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create videos in bulk',
      error: error.message
    });
  }
});

module.exports = router;
