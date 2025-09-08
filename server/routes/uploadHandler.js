const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middlewares/auth');

// Note: These packages need to be installed:
// npm install multer cloudinary
// npm install @types/multer (if using TypeScript)

const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');

// Configure Cloudinary with enhanced error handling
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dw6646onz',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Log Cloudinary configuration status
console.log('🔧 Cloudinary Backend Configuration:', {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'dw6646onz',
  hasApiKey: !!process.env.CLOUDINARY_API_KEY,
  hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
  environment: process.env.NODE_ENV || 'development'
});

// Check if Cloudinary is properly configured
if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️ Cloudinary API credentials not found in environment variables');
  console.warn('⚠️ Server-side file uploads may not work properly');
  console.warn('⚠️ Please set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your .env file');
}

// Configure multer for memory storage (files will be uploaded to Cloudinary directly)
const storage = multer.memoryStorage();

// File filter for videos
const videoFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo', // .avi
    'video/x-ms-wmv',  // .wmv
    'video/webm'
  ];

  const allowedExtensions = ['.mp4', '.mpeg', '.mov', '.avi', '.wmv', '.webm'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed formats: ${allowedExtensions.join(', ')}`), false);
  }
};

// File filter for images (thumbnails)
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid image type. Allowed formats: ${allowedExtensions.join(', ')}`), false);
  }
};

// Configure multer upload for videos
const uploadVideo = multer({
  storage: storage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1
  }
});

// Configure multer upload for images
const uploadImage = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for images
    files: 1
  }
});

// Helper function to upload buffer to Cloudinary with enhanced error handling
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      reject(new Error('Cloudinary API credentials not configured. Please check your environment variables.'));
      return;
    }

    const uploadOptions = {
      resource_type: options.resourceType || 'auto',
      folder: options.folder || 'pcea-turi-sermons',
      public_id: options.publicId,
      tags: options.tags || ['sermon', 'pcea-turi'],
      format: options.format,
      quality: options.quality || 'auto',
      use_filename: options.useFilename || false,
      unique_filename: options.uniqueFilename !== false,
      overwrite: options.overwrite || false,
      ...options.cloudinaryOptions
    };

    // Log upload attempt
    console.log(`📤 Cloudinary upload starting:`, {
      resourceType: uploadOptions.resource_type,
      folder: uploadOptions.folder,
      size: `${(buffer.length / 1024 / 1024).toFixed(2)}MB`
    });

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload failed:', error);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          console.log(`✅ Cloudinary upload successful: ${result.public_id}`);
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
};

// POST upload video file for sermon
router.post('/sermons/upload-video', verifyToken, uploadVideo.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const { title, folder = 'sermons/videos' } = req.body;

    // Generate unique public ID
    const timestamp = Date.now();
    const publicId = `${folder}/${title ? title.replace(/[^a-zA-Z0-9]/g, '_') : 'video'}_${timestamp}`;

    console.log(`📹 Starting video upload: ${originalname} (${(size / 1024 / 1024).toFixed(2)}MB)`);

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(buffer, {
      resourceType: 'video',
      folder: folder,
      publicId: publicId,
      tags: ['sermon', 'video', 'pcea-turi'],
      cloudinaryOptions: {
        eager: [
          { quality: 'auto', format: 'mp4' },
          { quality: 'auto', format: 'webm' }
        ],
        eager_async: true
      }
    });

    console.log(`✅ Video uploaded successfully: ${uploadResult.public_id}`);

    res.status(201).json({
      success: true,
      message: 'Video uploaded successfully',
      data: {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        format: uploadResult.format,
        duration: uploadResult.duration,
        width: uploadResult.width,
        height: uploadResult.height,
        size: uploadResult.bytes,
        playbackUrl: uploadResult.playback_url,
        thumbnailUrl: cloudinary.url(uploadResult.public_id, {
          resource_type: 'video',
          format: 'jpg',
          transformation: [
            { width: 800, height: 450, crop: 'fill', quality: 'auto' }
          ]
        }),
        metadata: {
          originalName: originalname,
          mimetype: mimetype,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id
        }
      }
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    
    // Enhanced error handling for common issues
    if (error.message.includes('File size too large') || error.message.includes('413')) {
      return res.status(413).json({
        success: false,
        message: 'Video file is too large. Maximum size is 500MB.',
        error: error.message
      });
    }

    if (error.message.includes('Invalid file type') || error.message.includes('format')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a valid video file (MP4, MOV, AVI, WebM).',
        error: error.message
      });
    }

    if (error.message.includes('Cloudinary API credentials')) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error. Please contact administrator.',
        error: 'Upload service not properly configured'
      });
    }

    if (error.message.includes('network') || error.message.includes('timeout')) {
      return res.status(503).json({
        success: false,
        message: 'Upload service temporarily unavailable. Please try again later.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload video',
      error: error.message
    });
  }
});

// POST upload thumbnail/image for sermon
router.post('/sermons/upload-image', verifyToken, uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const { title, folder = 'sermons/thumbnails', width, height } = req.body;

    // Generate unique public ID
    const timestamp = Date.now();
    const publicId = `${folder}/${title ? title.replace(/[^a-zA-Z0-9]/g, '_') : 'thumbnail'}_${timestamp}`;

    console.log(`🖼️ Starting image upload: ${originalname} (${(size / 1024 / 1024).toFixed(2)}MB)`);

    // Upload to Cloudinary with transformations
    const uploadResult = await uploadToCloudinary(buffer, {
      resourceType: 'image',
      folder: folder,
      publicId: publicId,
      tags: ['sermon', 'thumbnail', 'pcea-turi'],
      cloudinaryOptions: {
        transformation: width && height ? [
          { width: parseInt(width), height: parseInt(height), crop: 'fill', quality: 'auto' }
        ] : [
          { width: 1200, height: 675, crop: 'fill', quality: 'auto' } // 16:9 aspect ratio
        ]
      }
    });

    console.log(`✅ Image uploaded successfully: ${uploadResult.public_id}`);

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        size: uploadResult.bytes,
        thumbnailUrl: cloudinary.url(uploadResult.public_id, {
          transformation: [
            { width: 400, height: 225, crop: 'fill', quality: 'auto' }
          ]
        }),
        metadata: {
          originalName: originalname,
          mimetype: mimetype,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id
        }
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    
    if (error.message.includes('File size too large')) {
      return res.status(413).json({
        success: false,
        message: 'Image file is too large. Maximum size is 20MB.',
        error: error.message
      });
    }

    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a valid image file.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// POST upload audio file for sermon
router.post('/sermons/upload-audio', verifyToken, async (req, res) => {
  try {
    const uploadAudio = multer({
      storage: storage,
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'audio/mpeg',    // .mp3
          'audio/wav',     // .wav
          'audio/x-wav',   // .wav
          'audio/mp4',     // .m4a
          'audio/aac',     // .aac
          'audio/ogg',     // .ogg
          'audio/webm'     // .webm
        ];

        const allowedExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm'];
        const fileExtension = path.extname(file.originalname).toLowerCase();

        if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid audio type. Allowed formats: ${allowedExtensions.join(', ')}`), false);
        }
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for audio
        files: 1
      }
    }).single('audio');

    uploadAudio(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No audio file provided'
        });
      }

      const { originalname, buffer, mimetype, size } = req.file;
      const { title, folder = 'sermons/audio' } = req.body;

      // Generate unique public ID
      const timestamp = Date.now();
      const publicId = `${folder}/${title ? title.replace(/[^a-zA-Z0-9]/g, '_') : 'audio'}_${timestamp}`;

      console.log(`🎵 Starting audio upload: ${originalname} (${(size / 1024 / 1024).toFixed(2)}MB)`);

      try {
        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(buffer, {
          resourceType: 'auto',
          folder: folder,
          publicId: publicId,
          tags: ['sermon', 'audio', 'pcea-turi']
        });

        console.log(`✅ Audio uploaded successfully: ${uploadResult.public_id}`);

        res.status(201).json({
          success: true,
          message: 'Audio uploaded successfully',
          data: {
            publicId: uploadResult.public_id,
            url: uploadResult.secure_url,
            format: uploadResult.format,
            duration: uploadResult.duration,
            size: uploadResult.bytes,
            metadata: {
              originalName: originalname,
              mimetype: mimetype,
              uploadedAt: new Date().toISOString(),
              uploadedBy: req.user.id
            }
          }
        });
      } catch (uploadError) {
        console.error('Error uploading audio to Cloudinary:', uploadError);
        res.status(500).json({
          success: false,
          message: 'Failed to upload audio',
          error: uploadError.message
        });
      }
    });
  } catch (error) {
    console.error('Error in audio upload setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process audio upload',
      error: error.message
    });
  }
});

// POST upload PDF/document file for sermon notes
router.post('/sermons/upload-document', verifyToken, async (req, res) => {
  try {
    const uploadDocument = multer({
      storage: storage,
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        const allowedExtensions = ['.pdf', '.doc', '.docx'];
        const fileExtension = path.extname(file.originalname).toLowerCase();

        if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid document type. Allowed formats: ${allowedExtensions.join(', ')}`), false);
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for documents
        files: 1
      }
    }).single('document');

    uploadDocument(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No document file provided'
        });
      }

      const { originalname, buffer, mimetype, size } = req.file;
      const { title, folder = 'sermons/documents' } = req.body;

      // Generate unique public ID
      const timestamp = Date.now();
      const publicId = `${folder}/${title ? title.replace(/[^a-zA-Z0-9]/g, '_') : 'document'}_${timestamp}`;

      console.log(`📄 Starting document upload: ${originalname} (${(size / 1024 / 1024).toFixed(2)}MB)`);

      try {
        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(buffer, {
          resourceType: 'raw', // Use 'raw' for non-image/video files
          folder: folder,
          publicId: publicId,
          tags: ['sermon', 'document', 'notes', 'pcea-turi']
        });

        console.log(`✅ Document uploaded successfully: ${uploadResult.public_id}`);

        res.status(201).json({
          success: true,
          message: 'Document uploaded successfully',
          data: {
            publicId: uploadResult.public_id,
            url: uploadResult.secure_url,
            format: uploadResult.format,
            size: uploadResult.bytes,
            metadata: {
              originalName: originalname,
              mimetype: mimetype,
              uploadedAt: new Date().toISOString(),
              uploadedBy: req.user.id
            }
          }
        });
      } catch (uploadError) {
        console.error('Error uploading document to Cloudinary:', uploadError);
        res.status(500).json({
          success: false,
          message: 'Failed to upload document',
          error: uploadError.message
        });
      }
    });
  } catch (error) {
    console.error('Error in document upload setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process document upload',
      error: error.message
    });
  }
});

// DELETE uploaded file from Cloudinary (admin only)
router.delete('/upload/:publicId', verifyToken, async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType = 'auto' } = req.query;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required'
      });
    }

    // Decode the public ID (it might be URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    console.log(`🗑️ Deleting file from Cloudinary: ${decodedPublicId}`);

    // Delete from Cloudinary
    const deleteResult = await cloudinary.uploader.destroy(decodedPublicId, {
      resource_type: resourceType,
      invalidate: true
    });

    if (deleteResult.result === 'ok') {
      console.log(`✅ File deleted successfully: ${decodedPublicId}`);
      res.json({
        success: true,
        message: 'File deleted successfully',
        data: {
          publicId: decodedPublicId,
          result: deleteResult.result
        }
      });
    } else {
      console.log(`⚠️ File deletion result: ${deleteResult.result} for ${decodedPublicId}`);
      res.status(404).json({
        success: false,
        message: 'File not found or already deleted',
        data: {
          publicId: decodedPublicId,
          result: deleteResult.result
        }
      });
    }
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
});

// GET upload progress/status (for chunked uploads - future enhancement)
router.get('/upload-status/:uploadId', verifyToken, async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    // This is a placeholder for future implementation of chunked/resumable uploads
    // For now, return a simple response
    res.json({
      success: true,
      message: 'Upload status endpoint - not implemented yet',
      data: {
        uploadId: uploadId,
        status: 'pending',
        progress: 0
      }
    });
  } catch (error) {
    console.error('Error fetching upload status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload status',
      error: error.message
    });
  }
});

module.exports = router;
