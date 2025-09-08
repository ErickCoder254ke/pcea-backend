const express = require('express');
const router = express.Router();
const Sermon = require('../models/Sermon');
const { verifyToken, optionalAuth } = require('../../middlewares/auth');

// GET single video (latest/featured video for video player page)
// This endpoint is used by WatchVideos.jsx component
router.get('/video', optionalAuth, async (req, res) => {
  try {
    // Get the latest published sermon with video content, or a featured one
    let videoSermon = await Sermon.findOne({
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' },
      featured: true
    }).sort({ publishedAt: -1 });

    // If no featured sermon with video, get the latest one with video
    if (!videoSermon) {
      videoSermon = await Sermon.findOne({
        isActive: true,
        status: 'published',
        'media.video.url': { $exists: true, $ne: '' }
      }).sort({ publishedAt: -1 });
    }

    // If still no video sermon found, return sample data
    if (!videoSermon) {
      const mockVideoData = {
        id: 'sample-1',
        title: 'Walking in Faith - Sunday Service',
        description: 'Join us for an inspiring message about finding strength and purpose through faith. Pastor David Johnson shares powerful insights from Scripture about trusting God\'s plan even in uncertain times. This message includes practical applications for daily life and encourages believers to step out in faith.',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=450&fit=crop&crop=face',
        speaker: 'Pastor David Johnson',
        duration: '42:15',
        uploadDate: new Date().toISOString().split('T')[0],
        category: 'Sermon',
        series: 'Faith Journey',
        tags: ['Faith', 'Trust', 'Purpose', 'Scripture', 'Daily Life'],
        likes: 156,
        views: 2847,
        churchName: 'PCEA Turi',
        quality: ['720p', '1080p']
      };

      return res.json(mockVideoData);
    }

    // Increment view count (async, don't wait)
    videoSermon.incrementViews().catch(err => {
      console.error('Error incrementing video views:', err);
    });

    // Transform sermon data to video format expected by frontend
    const videoData = {
      id: videoSermon._id.toString(),
      title: videoSermon.title,
      description: videoSermon.description,
      url: videoSermon.media.video.url,
      thumbnail: videoSermon.media.thumbnail?.url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(videoSermon.speaker.name)}&size=800&background=6366f1&color=ffffff&rounded=true`,
      speaker: videoSermon.speaker.name,
      speakerTitle: videoSermon.speaker.title,
      speakerBio: videoSermon.speaker.bio,
      speakerImageUrl: videoSermon.speaker.imageUrl,
      duration: videoSermon.formattedDuration, // Uses virtual from model
      uploadDate: videoSermon.publishedAt?.toISOString().split('T')[0] || videoSermon.date.toISOString().split('T')[0],
      category: videoSermon.category,
      topic: videoSermon.topic,
      series: videoSermon.series.name || 'Sunday Service',
      seriesPart: videoSermon.series.part,
      seriesTotalParts: videoSermon.series.totalParts,
      scripture: videoSermon.scripture,
      transcript: videoSermon.transcript,
      tags: videoSermon.tags || ['Faith', 'Growth'],
      likes: videoSermon.stats.likes || 0,
      views: videoSermon.stats.views || 0,
      downloads: videoSermon.stats.downloads || 0,
      shares: videoSermon.stats.shares || 0,
      churchName: videoSermon.metadata?.location || 'PCEA Turi Church',
      quality: [videoSermon.media.video.quality || '720p'],
      videoQuality: videoSermon.media.video.quality || '720p',
      videoFormat: videoSermon.media.video.format || 'mp4',
      videoSize: videoSermon.media.video.size,
      videoDuration: videoSermon.media.video.duration, // in seconds
      audioUrl: videoSermon.media.audio?.url || '',
      notesUrl: videoSermon.media.notes?.url || '',
      date: videoSermon.date,
      publishedAt: videoSermon.publishedAt,
      featured: videoSermon.featured,
      isNew: videoSermon.publishedAt && new Date(videoSermon.publishedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    };

    res.json(videoData);
  } catch (error) {
    console.error('Error fetching video data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve video data',
      error: error.message
    });
  }
});

// GET all videos (list of sermons with video content)
router.get('/videos', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      speaker,
      series,
      featured, 
      limit = 20, 
      offset = 0, 
      search,
      sortBy = 'newest',
      tags
    } = req.query;

    // Build query for sermons with video content
    let query = { 
      isActive: true, 
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' }
    };

    // Apply filters
    if (category && category !== 'all') {
      query.category = category;
    }

    if (speaker && speaker.trim()) {
      query['speaker.name'] = new RegExp(speaker.trim(), 'i');
    }

    if (series && series.trim()) {
      query['series.name'] = new RegExp(series.trim(), 'i');
    }

    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    let videoQuery;

    // Handle search
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
      videoQuery = Sermon.find(query, { score: { $meta: 'textScore' } });
      videoQuery.sort({ score: { $meta: 'textScore' }, publishedAt: -1 });
    } else {
      videoQuery = Sermon.find(query);
      
      // Apply sorting
      switch (sortBy) {
        case 'oldest':
          videoQuery.sort({ publishedAt: 1 });
          break;
        case 'popular':
          videoQuery.sort({ 'stats.views': -1, publishedAt: -1 });
          break;
        case 'liked':
          videoQuery.sort({ 'stats.likes': -1, publishedAt: -1 });
          break;
        case 'newest':
        default:
          videoQuery.sort({ publishedAt: -1 });
          break;
      }
    }

    // Get total count for pagination
    const totalCount = await Sermon.countDocuments(query);

    // Apply pagination
    const startIndex = parseInt(offset) || 0;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const videos = await videoQuery
      .skip(startIndex)
      .limit(limitNum)
      .populate('uploadedBy', 'name')
      .lean();

    // Transform sermon data to video format
    const transformedVideos = videos.map(sermon => ({
      id: sermon._id.toString(),
      title: sermon.title,
      description: sermon.description,
      url: sermon.media.video.url,
      thumbnail: sermon.media.thumbnail?.url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(sermon.speaker.name)}&size=400&background=6366f1&color=ffffff&rounded=true`,
      speaker: sermon.speaker.name,
      speakerTitle: sermon.speaker.title,
      duration: sermon.duration ? `${sermon.duration} min` : '0 min',
      uploadDate: sermon.publishedAt?.toISOString().split('T')[0] || sermon.date.toISOString().split('T')[0],
      category: sermon.category,
      series: sermon.series.name || '',
      tags: sermon.tags || [],
      likes: sermon.stats?.likes || 0,
      views: sermon.stats?.views || 0,
      featured: sermon.featured,
      quality: sermon.media.video.quality || '720p',
      date: sermon.date,
      publishedAt: sermon.publishedAt,
      isNew: sermon.publishedAt && new Date(sermon.publishedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }));

    res.json({
      success: true,
      message: 'Videos retrieved successfully',
      data: transformedVideos,
      pagination: {
        total: totalCount,
        offset: startIndex,
        limit: limitNum,
        hasMore: totalCount > startIndex + transformedVideos.length,
        page: Math.floor(startIndex / limitNum) + 1,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      meta: {
        query: { category, speaker, series, featured, search, sortBy, tags },
        resultCount: transformedVideos.length
      }
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve videos',
      error: error.message
    });
  }
});

// GET specific video by ID
router.get('/video/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const videoSermon = await Sermon.findOne({
      _id: id,
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' }
    }).populate('uploadedBy', 'name');

    if (!videoSermon) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Increment view count (async, don't wait)
    videoSermon.incrementViews().catch(err => {
      console.error('Error incrementing video views:', err);
    });

    // Transform to video format
    const videoData = {
      id: videoSermon._id.toString(),
      title: videoSermon.title,
      description: videoSermon.description,
      url: videoSermon.media.video.url,
      thumbnail: videoSermon.media.thumbnail?.url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(videoSermon.speaker.name)}&size=800&background=6366f1&color=ffffff&rounded=true`,
      speaker: videoSermon.speaker.name,
      speakerTitle: videoSermon.speaker.title,
      speakerBio: videoSermon.speaker.bio,
      speakerImageUrl: videoSermon.speaker.imageUrl,
      duration: videoSermon.formattedDuration,
      uploadDate: videoSermon.publishedAt?.toISOString().split('T')[0] || videoSermon.date.toISOString().split('T')[0],
      category: videoSermon.category,
      topic: videoSermon.topic,
      series: videoSermon.series.name || 'Sunday Service',
      seriesPart: videoSermon.series.part,
      seriesTotalParts: videoSermon.series.totalParts,
      scripture: videoSermon.scripture,
      transcript: videoSermon.transcript,
      tags: videoSermon.tags || [],
      likes: videoSermon.stats.likes,
      views: videoSermon.stats.views,
      downloads: videoSermon.stats.downloads,
      shares: videoSermon.stats.shares,
      churchName: videoSermon.metadata?.location || 'PCEA Turi Church',
      quality: [videoSermon.media.video.quality || '720p'],
      videoQuality: videoSermon.media.video.quality || '720p',
      videoFormat: videoSermon.media.video.format || 'mp4',
      videoSize: videoSermon.media.video.size,
      videoDuration: videoSermon.media.video.duration,
      audioUrl: videoSermon.media.audio?.url || '',
      notesUrl: videoSermon.media.notes?.url || '',
      date: videoSermon.date,
      publishedAt: videoSermon.publishedAt,
      updatedAt: videoSermon.updatedAt,
      featured: videoSermon.featured,
      metadata: videoSermon.metadata,
      uploadedBy: videoSermon.uploadedBy ? {
        id: videoSermon.uploadedBy._id,
        name: videoSermon.uploadedBy.name
      } : null
    };

    res.json({
      success: true,
      message: 'Video retrieved successfully',
      data: videoData
    });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve video',
      error: error.message
    });
  }
});

// POST create new video (admin only)
// Note: This creates a sermon with video content
router.post('/videos', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      speaker,
      date,
      duration,
      category = 'Sunday Service',
      topic,
      series,
      videoUrl,
      thumbnailUrl,
      audioUrl,
      notesUrl,
      videoQuality = '720p',
      videoFormat = 'mp4',
      videoSize,
      videoDuration,
      scripture,
      transcript,
      tags,
      featured = false,
      metadata
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      });
    }

    if (!speaker || !speaker.name || !speaker.name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Speaker name is required'
      });
    }

    if (!videoUrl || !videoUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Video URL is required'
      });
    }

    if (!topic || !topic.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required'
      });
    }

    // Create sermon with video content
    const sermon = new Sermon({
      title: title.trim(),
      description: description.trim(),
      speaker: {
        name: speaker.name.trim(),
        title: speaker.title?.trim() || '',
        bio: speaker.bio?.trim() || '',
        imageUrl: speaker.imageUrl?.trim() || ''
      },
      date: new Date(date || Date.now()),
      duration: parseInt(duration) || 30,
      category: category,
      topic: topic.trim(),
      series: {
        name: series?.name?.trim() || '',
        part: series?.part ? parseInt(series.part) : null,
        totalParts: series?.totalParts ? parseInt(series.totalParts) : null
      },
      scripture: scripture || { references: [], mainText: '' },
      media: {
        thumbnail: {
          url: thumbnailUrl?.trim() || ''
        },
        video: {
          url: videoUrl.trim(),
          quality: videoQuality,
          format: videoFormat,
          size: videoSize ? parseInt(videoSize) : null,
          duration: videoDuration ? parseInt(videoDuration) : null
        },
        audio: audioUrl ? {
          url: audioUrl.trim()
        } : {},
        notes: notesUrl ? {
          url: notesUrl.trim(),
          format: 'pdf'
        } : {}
      },
      transcript: transcript?.trim() || '',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
      featured: Boolean(featured),
      status: 'published', // Auto-publish videos
      metadata: metadata || {},
      uploadedBy: req.user.id
    });

    const savedSermon = await sermon.save();
    await savedSermon.populate('uploadedBy', 'name');

    console.log(`✅ New video sermon created: "${savedSermon.title}" by ${req.user.id}`);

    // Transform to video format for response
    const videoData = {
      id: savedSermon._id.toString(),
      title: savedSermon.title,
      description: savedSermon.description,
      url: savedSermon.media.video.url,
      thumbnail: savedSermon.media.thumbnail?.url || '',
      speaker: savedSermon.speaker.name,
      duration: savedSermon.formattedDuration,
      category: savedSermon.category,
      topic: savedSermon.topic,
      series: savedSermon.series.name,
      tags: savedSermon.tags,
      featured: savedSermon.featured,
      quality: savedSermon.media.video.quality,
      uploadedAt: savedSermon.uploadedAt,
      publishedAt: savedSermon.publishedAt
    };

    res.status(201).json({
      success: true,
      message: 'Video created successfully',
      data: videoData
    });
  } catch (error) {
    console.error('Error creating video:', error);
    
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
      message: 'Failed to create video',
      error: error.message
    });
  }
});

// PUT update video (admin only)
router.put('/video/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const sermon = await Sermon.findOne({
      _id: id,
      isActive: true,
      'media.video.url': { $exists: true, $ne: '' }
    });

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Build update object for video-specific fields
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
    if (updateData.transcript !== undefined) updateFields.transcript = updateData.transcript.trim();
    if (updateData.tags !== undefined) {
      updateFields.tags = Array.isArray(updateData.tags) ? 
        updateData.tags.map(tag => tag.trim().toLowerCase()) : [];
    }
    if (updateData.featured !== undefined) updateFields.featured = Boolean(updateData.featured);
    if (updateData.metadata !== undefined) updateFields.metadata = updateData.metadata;

    // Handle media updates
    if (updateData.videoUrl || updateData.thumbnailUrl || updateData.audioUrl || updateData.notesUrl) {
      updateFields.media = { ...sermon.media };
      
      if (updateData.videoUrl) {
        updateFields.media.video = {
          ...updateFields.media.video,
          url: updateData.videoUrl.trim(),
          quality: updateData.videoQuality || updateFields.media.video?.quality || '720p',
          format: updateData.videoFormat || updateFields.media.video?.format || 'mp4'
        };
      }
      
      if (updateData.thumbnailUrl) {
        updateFields.media.thumbnail = {
          ...updateFields.media.thumbnail,
          url: updateData.thumbnailUrl.trim()
        };
      }
      
      if (updateData.audioUrl) {
        updateFields.media.audio = {
          ...updateFields.media.audio,
          url: updateData.audioUrl.trim()
        };
      }
      
      if (updateData.notesUrl) {
        updateFields.media.notes = {
          ...updateFields.media.notes,
          url: updateData.notesUrl.trim()
        };
      }
    }

    const updatedSermon = await Sermon.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name');

    console.log(`✅ Video updated: "${updatedSermon.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Video updated successfully',
      data: {
        id: updatedSermon._id.toString(),
        title: updatedSermon.title,
        description: updatedSermon.description,
        url: updatedSermon.media.video.url,
        speaker: updatedSermon.speaker.name,
        category: updatedSermon.category,
        featured: updatedSermon.featured,
        updatedAt: updatedSermon.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video',
      error: error.message
    });
  }
});

// DELETE video (admin only)
router.delete('/video/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findOne({
      _id: id,
      isActive: true,
      'media.video.url': { $exists: true, $ne: '' }
    });

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Soft delete
    const deletedSermon = await Sermon.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    console.log(`🗑️ Video soft-deleted: "${deletedSermon.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Video deleted successfully',
      data: {
        id: deletedSermon._id.toString(),
        title: deletedSermon.title,
        deletedAt: deletedSermon.updatedAt
      }
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message
    });
  }
});

// POST like/unlike video
router.post('/video/:id/like', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { increment = true } = req.body;

    const sermon = await Sermon.findOne({
      _id: id,
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' }
    });

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    await sermon.toggleLike(increment);

    res.json({
      success: true,
      message: `Video ${increment ? 'liked' : 'unliked'} successfully`,
      data: {
        id: sermon._id.toString(),
        likes: sermon.stats.likes
      }
    });
  } catch (error) {
    console.error('Error toggling video like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update like status',
      error: error.message
    });
  }
});

// POST increment share count
router.post('/video/:id/share', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sermon = await Sermon.findOne({
      _id: id,
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' }
    });

    if (!sermon) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
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
    console.error('Error incrementing video share count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update share count',
      error: error.message
    });
  }
});

// GET related videos for a specific video
router.get('/video/:id/related', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 5 } = req.query;

    // Get the current video to find related ones
    const currentVideo = await Sermon.findOne({
      _id: id,
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' }
    });

    if (!currentVideo) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Find related videos based on series, speaker, or category
    const relatedQuery = {
      _id: { $ne: id },
      isActive: true,
      status: 'published',
      'media.video.url': { $exists: true, $ne: '' },
      $or: [
        { 'series.name': currentVideo.series.name },
        { 'speaker.name': currentVideo.speaker.name },
        { category: currentVideo.category },
        { tags: { $in: currentVideo.tags } }
      ]
    };

    const relatedVideos = await Sermon.find(relatedQuery)
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const transformedVideos = relatedVideos.map(sermon => ({
      id: sermon._id.toString(),
      title: sermon.title,
      thumbnail: sermon.media.thumbnail?.url || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(sermon.speaker.name)}&size=400&background=6366f1&color=ffffff&rounded=true`,
      speaker: sermon.speaker.name,
      duration: sermon.duration ? `${sermon.duration} min` : '0 min',
      views: sermon.stats?.views || 0,
      uploadDate: sermon.publishedAt?.toISOString().split('T')[0] || sermon.date.toISOString().split('T')[0],
      series: sermon.series.name,
      category: sermon.category
    }));

    res.json({
      success: true,
      message: 'Related videos retrieved successfully',
      data: transformedVideos
    });
  } catch (error) {
    console.error('Error fetching related videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve related videos',
      error: error.message
    });
  }
});

module.exports = router;
