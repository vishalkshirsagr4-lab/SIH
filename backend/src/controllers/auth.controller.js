import axios from 'axios';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

import User from '../models/User.js';
import OTP from '../models/OTP.js';
import { sendOTP as sendOTPEmail } from '../config/email.js';

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '30d' }
  );

  return { token: accessToken, refreshToken };
};

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  profileImage: user.profileImage || null,
});

const sendOTPForEmail = async (email) => {
  const otp = generateOTP();
  await OTP.findOneAndUpdate(
    { email },
    { email, otp },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await sendOTPEmail(email, otp);
  return otp;
};

export const registerWithEmail = async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    await sendOTPForEmail(normalizedEmail);

    res.status(200).json({
      message: 'OTP sent to email',
      email: normalizedEmail,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyOTPAndRegister = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password || !otp) {
      return res.status(400).json({ message: 'Name, email, password and OTP are required' });
    }

    const otpDoc = await OTP.findOne({ email: normalizedEmail });
    if (!otpDoc || String(otpDoc.otp) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      isEmailVerified: true,
    });

    await user.save();
    await OTP.deleteOne({ email: normalizedEmail });

    const { token, refreshToken } = generateTokens(user);
    setRefreshTokenCookie(res, refreshToken);

    res.status(201).json({
      message: 'User registered successfully',
      user: buildUserResponse(user),
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const loginWithEmail = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account is blocked' });
    }

    if (password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      user.lastLogin = new Date();
      await user.save();

      const { token, refreshToken } = generateTokens(user);
      setRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        message: 'Login successful',
        user: buildUserResponse(user),
        token,
      });
    }

    await sendOTPForEmail(normalizedEmail);

    res.status(200).json({
      message: 'OTP sent to email',
      email: normalizedEmail,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyOTPAndLogin = async (req, res) => {
  try {
    const { email, otp } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpDoc = await OTP.findOne({ email: normalizedEmail });
    if (!otpDoc || String(otpDoc.otp) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    await OTP.deleteOne({ email: normalizedEmail });
    user.lastLogin = new Date();
    await user.save();

    const { token, refreshToken } = generateTokens(user);
    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json({
      message: 'Login successful',
      user: buildUserResponse(user),
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { token, code, credential } = req.body ?? {};
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'postmessage';

    if (!googleClientId) {
      return res.status(500).json({ message: 'Google client ID is not configured on the server' });
    }

    const client = new OAuth2Client(googleClientId, googleClientSecret);
    let profile = null;

    if (code) {
      if (!googleClientSecret) {
        return res.status(500).json({ message: 'Google client secret is required for auth-code exchange' });
      }

      const { tokens } = await client.getToken({
        code,
        redirect_uri: redirectUri,
      });

      if (!tokens?.id_token) {
        return res.status(400).json({ message: 'Unable to verify Google credentials from auth code' });
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: googleClientId,
      });

      profile = ticket.getPayload();
    } else if (credential || (typeof token === 'string' && token.split('.').length === 3)) {
      const idToken = credential || token;
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      profile = ticket.getPayload();
    } else if (token) {
      const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      profile = response.data;
    } else {
      return res.status(400).json({ message: 'Google login payload missing code or token' });
    }

    if (!profile || !profile.email) {
      return res.status(400).json({ message: 'Unable to fetch Google user info' });
    }

    let user = await User.findOne({ email: profile.email });

    if (!user) {
      user = new User({
        name: profile.name || profile.email.split('@')[0],
        email: profile.email,
        googleId: profile.sub || profile.id,
        profileImage: profile.picture,
        isEmailVerified: true,
      });
      await user.save();
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account is blocked' });
    }

    user.lastLogin = new Date();
    await user.save();

    const { token: jwtToken, refreshToken } = generateTokens(user);
    setRefreshTokenCookie(res, refreshToken);

    res.status(200).json({
      message: 'Google login successful',
      user: buildUserResponse(user),
      token: jwtToken,
    });
  } catch (error) {
    console.error('Google auth error:', error.message || error);
    res.status(500).json({ message: error.message });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const { token, refreshToken: newRefreshToken } = generateTokens(user);
    setRefreshTokenCookie(res, newRefreshToken);

    res.status(200).json({ token });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    await sendOTPForEmail(normalizedEmail);

    res.status(200).json({
      message: 'OTP sent to email',
      email: normalizedEmail,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body ?? {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const otpDoc = await OTP.findOne({ email: normalizedEmail });
    if (!otpDoc || String(otpDoc.otp) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();
    await OTP.deleteOne({ email: normalizedEmail });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendOTP = async (req, res) => {
  await loginWithEmail(req, res);
};

export const verifyOTP = async (req, res) => {
  await verifyOTPAndLogin(req, res);
};
