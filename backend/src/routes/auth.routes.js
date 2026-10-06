import express from 'express';

import {
  registerWithEmail,
  verifyOTPAndRegister,
  loginWithEmail,
  verifyOTPAndLogin,
  googleAuth,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  sendOTP,
  verifyOTP,
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', registerWithEmail);
router.post('/register/verify', verifyOTPAndRegister);
router.post('/login', loginWithEmail);
router.post('/login/verify', verifyOTPAndLogin);
router.post('/google', googleAuth);
router.post('/refresh-token', refreshAccessToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);

export default router;
