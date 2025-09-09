/**
 * Admin Setup Script
 * 
 * This script helps set up admin permissions for a user
 * Usage: node setup-admin.js <phone_number>
 * Example: node setup-admin.js 0712345678
 */

const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function setupAdmin(phoneNumber) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    if (!phoneNumber) {
      console.log('❌ Please provide a phone number');
      console.log('Usage: node setup-admin.js <phone_number>');
      console.log('Example: node setup-admin.js 0712345678');
      
      // Show all users if no phone provided
      const users = await User.find({}).select('name phone role isAdmin').limit(10);
      console.log('\n📋 Current users:');
      users.forEach(user => {
        console.log(`  ${user.name} (${user.phone}) - Role: ${user.role || 'member'}, Admin: ${user.isAdmin || false}`);
      });
      
      return;
    }

    // Clean phone number (remove any non-digits and ensure 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Convert to 10-digit format if it starts with country code
    let searchPhone = cleanPhone;
    if (cleanPhone.length === 12 && cleanPhone.startsWith('254')) {
      searchPhone = '0' + cleanPhone.slice(3);
    } else if (cleanPhone.length === 13 && cleanPhone.startsWith('+254')) {
      searchPhone = '0' + cleanPhone.slice(4);
    } else if (cleanPhone.length === 9) {
      searchPhone = '0' + cleanPhone;
    }

    console.log(`🔍 Looking for user with phone: ${searchPhone}`);

    // Find the user
    const user = await User.findOne({ phone: searchPhone });

    if (!user) {
      console.log(`❌ User not found with phone number: ${searchPhone}`);
      
      // Show similar phone numbers
      const similarUsers = await User.find({
        phone: { $regex: cleanPhone.slice(-4) }
      }).select('name phone').limit(5);
      
      if (similarUsers.length > 0) {
        console.log('\n🔍 Users with similar phone numbers:');
        similarUsers.forEach(u => {
          console.log(`  ${u.name} - ${u.phone}`);
        });
      }
      return;
    }

    console.log(`👤 Found user: ${user.name} (${user.phone})`);
    console.log(`   Current role: ${user.role || 'member'}`);
    console.log(`   Current isAdmin: ${user.isAdmin || false}`);

    // Update user to admin
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { 
        role: 'admin',
        isAdmin: true
      },
      { new: true }
    );

    console.log('\n✅ User promoted to admin successfully!');
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Phone: ${updatedUser.phone}`);
    console.log(`   Role: ${updatedUser.role}`);
    console.log(`   Admin: ${updatedUser.isAdmin}`);
    console.log(`   Can send notifications: ${updatedUser.isAdminUser ? updatedUser.isAdminUser() : 'Yes'}`);

  } catch (error) {
    console.error('❌ Error setting up admin:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Get phone number from command line arguments
const phoneNumber = process.argv[2];

console.log('🔧 Admin Setup Script');
console.log('='.repeat(50));

setupAdmin(phoneNumber);
