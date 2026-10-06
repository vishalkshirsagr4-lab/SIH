import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import User from '../src/models/User.js';
import { connectDB } from '../src/config/db.js';

const MONGO = process.env.MONGODB_URI;
const ADMIN_EMAIL = process.env.CREATE_ADMIN_EMAIL || 'vishalkshirsagr4@gmail.com';
const ADMIN_PASSWORD = process.env.CREATE_ADMIN_PASSWORD || 'Vishal@86601';

import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

export const createAdmin = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      existing.role = 'admin';
      existing.isEmailVerified = true;
      if (ADMIN_PASSWORD) existing.password = ADMIN_PASSWORD;
      await existing.save();
      console.log(`Promoted existing user ${ADMIN_EMAIL} to admin`);
      return existing;
    }

    const user = new User({
      name: 'Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      isEmailVerified: true,
    });
    await user.save();
    console.log(`Created admin user ${ADMIN_EMAIL}`);
    return user;
  } catch (err) {
    console.error('Error creating admin:', err);
    throw err;
  }
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  createAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}