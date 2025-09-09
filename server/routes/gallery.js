const express = require('express');
const router = express.Router();
const Gallery = require('../models/Gallery');
const { verifyToken, optionalAuth } = require('../../middlewares/auth');
const { requireAdminAccess } = require('../../middlewares/flexible-auth');

// GET all gallery items (public endpoint with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      featured, 
      limit = 20, 
      offset = 0, 
      search,
      sortBy = 'newest',
      tags
    } = req.query;

    // Build query object
    let query = { isActive: true };

    // Filter by category
    if (category && category !== 'all' && category !== 'All') {
      query.category = category;
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

    let galleryQuery;

    // Handle search
    if (search && search.trim()) {
      // Use text search if search query provided
      query.$text = { $search: search.trim() };
      galleryQuery = Gallery.find(query, { score: { $meta: 'textScore' } });
      
      // Sort by text score first, then by date
      if (sortBy === 'relevance') {
        galleryQuery.sort({ score: { $meta: 'textScore' }, uploadedAt: -1 });
      } else {
        galleryQuery.sort({ score: { $meta: 'textScore' }, uploadedAt: sortBy === 'oldest' ? 1 : -1 });
      }
    } else {
      galleryQuery = Gallery.find(query);
      
      // Apply sorting
      switch (sortBy) {
        case 'oldest':
          galleryQuery.sort({ uploadedAt: 1 });
          break;
        case 'popular':
          galleryQuery.sort({ views: -1, uploadedAt: -1 });
          break;
        case 'liked':
          galleryQuery.sort({ likes: -1, uploadedAt: -1 });
          break;
        case 'newest':
        default:
          galleryQuery.sort({ uploadedAt: -1 });
          break;
      }
    }

    // Get total count for pagination
    const totalCount = await Gallery.countDocuments(query);

    // Apply pagination
    const startIndex = parseInt(offset) || 0;
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 items per request

    const galleryItems = await galleryQuery
      .skip(startIndex)
      .limit(limitNum)
      .populate('uploadedBy', 'name')
      .lean(); // Use lean() for better performance

    // Transform data for frontend compatibility
    const transformedItems = galleryItems.map(item => ({
      id: item._id.toString(),
      title: item.title,
      description: item.description,
      category: item.category,
      tags: item.tags || [],
      cloudinary: item.cloudinary,
      featured: item.featured,
      uploadedAt: item.uploadedAt,
      views: item.views || 0,
      likes: item.likes || 0,
      uploadedBy: item.uploadedBy ? {
        id: item.uploadedBy._id,
        name: item.uploadedBy.name
      } : null
    }));

    res.json({
      success: true,
      message: 'Gallery items retrieved successfully',
      data: transformedItems,
      pagination: {
        total: totalCount,
        offset: startIndex,
        limit: limitNum,
        hasMore: totalCount > startIndex + transformedItems.length,
        page: Math.floor(startIndex / limitNum) + 1,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      meta: {
        query: { category, featured, search, sortBy, tags },
        resultCount: transformedItems.length
      }
    });
  } catch (error) {
    console.error('Error fetching gallery items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve gallery items',
      error: error.message
    });
  }
});

// POST new gallery item (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      tags,
      cloudinary,
      featured = false
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    if (!cloudinary || !cloudinary.url || !cloudinary.publicId) {
      return res.status(400).json({
        success: false,
        message: 'Cloudinary image data is required (url and publicId)'
      });
    }

    // Check if publicId already exists
    const existingImage = await Gallery.findOne({ 
      'cloudinary.publicId': cloudinary.publicId,
      isActive: true 
    });

    if (existingImage) {
      return res.status(409).json({
        success: false,
        message: 'Image with this publicId already exists',
        existing: {
          id: existingImage._id,
          title: existingImage.title
        }
      });
    }

    // Create new gallery item
    const galleryItem = new Gallery({
      title: title.trim(),
      description: description?.trim() || '',
      category: category || 'Other',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
      cloudinary: {
        publicId: cloudinary.publicId,
        url: cloudinary.url,
        thumbnailUrl: cloudinary.thumbnailUrl || cloudinary.url,
        width: cloudinary.width || null,
        height: cloudinary.height || null,
        format: cloudinary.format || null,
        size: cloudinary.size || null
      },
      featured: Boolean(featured),
      uploadedBy: req.user.id
    });

    const savedItem = await galleryItem.save();
    
    // Populate uploadedBy for response
    await savedItem.populate('uploadedBy', 'name');

    console.log(`✅ New gallery item created: "${savedItem.title}" by ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Gallery item created successfully',
      data: {
        id: savedItem._id.toString(),
        title: savedItem.title,
        description: savedItem.description,
        category: savedItem.category,
        tags: savedItem.tags,
        cloudinary: savedItem.cloudinary,
        featured: savedItem.featured,
        uploadedAt: savedItem.uploadedAt,
        uploadedBy: savedItem.uploadedBy ? {
          id: savedItem.uploadedBy._id,
          name: savedItem.uploadedBy.name
        } : null
      }
    });
  } catch (error) {
    console.error('Error creating gallery item:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Image with this publicId already exists',
        error: 'Duplicate publicId'
      });
    }
    
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
      message: 'Failed to create gallery item',
      error: error.message
    });
  }
});

// PUT update gallery item (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      tags,
      featured
    } = req.body;

    // Find the gallery item
    const galleryItem = await Gallery.findById(id);

    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Build update object
    const updateData = {};
    
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [];
    }
    if (featured !== undefined) updateData.featured = Boolean(featured);

    // Update the item
    const updatedItem = await Gallery.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name');

    console.log(`✅ Gallery item updated: "${updatedItem.title}" by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Gallery item updated successfully',
      data: {
        id: updatedItem._id.toString(),
        title: updatedItem.title,
        description: updatedItem.description,
        category: updatedItem.category,
        tags: updatedItem.tags,
        cloudinary: updatedItem.cloudinary,
        featured: updatedItem.featured,
        uploadedAt: updatedItem.uploadedAt,
        updatedAt: updatedItem.updatedAt,
        uploadedBy: updatedItem.uploadedBy ? {
          id: updatedItem.uploadedBy._id,
          name: updatedItem.uploadedBy.name
        } : null
      }
    });
  } catch (error) {
    console.error('Error updating gallery item:', error);
    
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
      message: 'Failed to update gallery item',
      error: error.message
    });
  }
});

// DELETE gallery item (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const galleryItem = await Gallery.findById(id);

    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Soft delete by setting isActive to false
    const deletedItem = await Gallery.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    console.log(`🗑️ Gallery item soft-deleted: "${deletedItem.title}" by ${req.user.id}`);

    // Note: In production, you should also delete the image from Cloudinary
    // This requires implementing server-side Cloudinary deletion

    res.json({
      success: true,
      message: 'Gallery item deleted successfully',
      data: {
        id: deletedItem._id.toString(),
        title: deletedItem.title,
        deletedAt: deletedItem.updatedAt
      }
    });
  } catch (error) {
    console.error('Error deleting gallery item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete gallery item',
      error: error.message
    });
  }
});

// GET single gallery item (public with optional auth)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const galleryItem = await Gallery.findOne({ 
      _id: id, 
      isActive: true 
    }).populate('uploadedBy', 'name');

    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    // Increment view count (async, don't wait)
    galleryItem.incrementViews().catch(err => {
      console.error('Error incrementing views:', err);
    });

    res.json({
      success: true,
      message: 'Gallery item retrieved successfully',
      data: {
        id: galleryItem._id.toString(),
        title: galleryItem.title,
        description: galleryItem.description,
        category: galleryItem.category,
        tags: galleryItem.tags,
        cloudinary: galleryItem.cloudinary,
        featured: galleryItem.featured,
        uploadedAt: galleryItem.uploadedAt,
        updatedAt: galleryItem.updatedAt,
        views: galleryItem.views,
        likes: galleryItem.likes,
        uploadedBy: galleryItem.uploadedBy ? {
          id: galleryItem.uploadedBy._id,
          name: galleryItem.uploadedBy.name
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching gallery item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve gallery item',
      error: error.message
    });
  }
});

// GET gallery categories (public)
router.get('/admin/categories', async (req, res) => {
  try {
    const categories = await Gallery.distinct('category', { isActive: true });
    
    // Get category counts
    const categoryCounts = await Gallery.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      message: 'Gallery categories retrieved successfully',
      data: {
        categories: categories.sort(),
        counts: categoryCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Error fetching gallery categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve gallery categories',
      error: error.message
    });
  }
});

// POST bulk upload (admin only)
router.post('/bulk', verifyToken, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required and must not be empty'
      });
    }

    const results = [];
    const errors = [];

    // Process each item
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const {
          title,
          description,
          category,
          tags,
          cloudinary,
          featured = false
        } = item;

        // Validation
        if (!title || !title.trim()) {
          errors.push(`Item ${i + 1}: Title is required`);
          continue;
        }

        if (!cloudinary || !cloudinary.url || !cloudinary.publicId) {
          errors.push(`Item ${i + 1}: Cloudinary image data is required`);
          continue;
        }

        // Check for duplicates
        const existingImage = await Gallery.findOne({ 
          'cloudinary.publicId': cloudinary.publicId,
          isActive: true 
        });

        if (existingImage) {
          errors.push(`Item ${i + 1}: Image with publicId ${cloudinary.publicId} already exists`);
          continue;
        }

        // Create gallery item
        const galleryItem = new Gallery({
          title: title.trim(),
          description: description?.trim() || '',
          category: category || 'Other',
          tags: Array.isArray(tags) ? tags.map(tag => tag.trim().toLowerCase()) : [],
          cloudinary: {
            publicId: cloudinary.publicId,
            url: cloudinary.url,
            thumbnailUrl: cloudinary.thumbnailUrl || cloudinary.url,
            width: cloudinary.width || null,
            height: cloudinary.height || null,
            format: cloudinary.format || null,
            size: cloudinary.size || null
          },
          featured: Boolean(featured),
          uploadedBy: req.user.id
        });

        const savedItem = await galleryItem.save();
        results.push({
          id: savedItem._id.toString(),
          title: savedItem.title,
          publicId: savedItem.cloudinary.publicId
        });

      } catch (itemError) {
        console.error(`Error processing item ${i + 1}:`, itemError);
        errors.push(`Item ${i + 1}: ${itemError.message}`);
      }
    }

    console.log(`📦 Bulk upload completed: ${results.length} items created, ${errors.length} errors`);

    res.status(201).json({
      success: true,
      message: `Bulk upload completed: ${results.length} items created successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      stats: {
        total: items.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Error in bulk upload:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed',
      error: error.message
    });
  }
});

// GET gallery statistics (admin only)
router.get('/admin/stats', verifyToken, requireAdminAccess, async (req, res) => {
  try {
    const stats = await Gallery.getStats();
    
    res.json({
      success: true,
      message: 'Gallery statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching gallery stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve gallery statistics',
      error: error.message
    });
  }
});

// POST toggle featured status (admin only)
router.post('/:id/toggle-featured', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const galleryItem = await Gallery.findById(id);
    if (!galleryItem) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    galleryItem.featured = !galleryItem.featured;
    await galleryItem.save();

    console.log(`⭐ Gallery item "${galleryItem.title}" featured status: ${galleryItem.featured}`);

    res.json({
      success: true,
      message: `Gallery item ${galleryItem.featured ? 'featured' : 'unfeatured'} successfully`,
      data: {
        id: galleryItem._id.toString(),
        title: galleryItem.title,
        featured: galleryItem.featured
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

module.exports = router;
