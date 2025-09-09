/**
 * Test script to debug video creation issues
 * Usage: node test-video-creation.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Video = require('./server/models/Video');

async function testVideoCreation() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test video data similar to what frontend sends
    const testVideoData = {
      title: 'Test Video Creation',
      description: 'This is a test video to debug creation issues',
      category: 'Other',
      tags: ['test', 'debug'],
      speaker: {
        name: 'Test Speaker',
        title: 'Pastor'
      },
      duration: 30,
      featured: false,
      source: {
        type: 'url',
        externalUrl: 'https://example.com/test-video.mp4'
      },
      status: 'published',
      uploadedBy: new mongoose.Types.ObjectId() // Mock user ID
    };

    console.log('📹 Testing video creation with data:', {
      title: testVideoData.title,
      sourceType: testVideoData.source.type,
      hasUploadedBy: !!testVideoData.uploadedBy
    });

    // Create video instance
    const newVideo = new Video(testVideoData);
    
    // Validate before saving
    console.log('🔍 Validating video data...');
    await newVideo.validate();
    console.log('✅ Video data validation passed');

    // Save to database
    console.log('💾 Saving video to database...');
    const savedVideo = await newVideo.save();
    console.log('✅ Video saved successfully with ID:', savedVideo._id);

    // Clean up - delete the test video
    console.log('🧹 Cleaning up test video...');
    await Video.findByIdAndDelete(savedVideo._id);
    console.log('✅ Test video deleted');

    console.log('\n🎉 Video creation test PASSED - No model validation issues found');

  } catch (error) {
    console.error('❌ Video creation test FAILED:', error);
    
    if (error.name === 'ValidationError') {
      console.error('📋 Validation errors:');
      Object.keys(error.errors).forEach(key => {
        console.error(`  - ${key}: ${error.errors[key].message}`);
      });
    }
    
    if (error.code === 11000) {
      console.error('🔄 Duplicate key error:', error.keyPattern);
    }
    
    console.error('\n🔍 Full error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the test
if (require.main === module) {
  testVideoCreation()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Test script error:', error);
      process.exit(1);
    });
}

module.exports = { testVideoCreation };
