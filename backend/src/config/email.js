import { sendOTPEmail } from '../services/email.service.js';

export const sendOTP = async (email, otp) => {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    console.warn('Email OTP sender is not configured. Skipping actual email send.');
    return { ok: true, skipped: true };
  }

  return sendOTPEmail(email, otp);
};
