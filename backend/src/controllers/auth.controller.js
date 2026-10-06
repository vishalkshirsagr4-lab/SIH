import User from "../models/User.js";
import { generateOTP, hashOTP, compareOTP } from "../utils/otp.js";
import { generateToken } from "../utils/token.js";
import { sendOTPEmail } from "../services/email.service.js";

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

export const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    let user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      user = await User.create({
        email: normalizedEmail,
      });
    }

    // Resend protection
    if (user.lastOtpSentAt) {
      const secondsSinceLastOTP =
        (Date.now() - user.lastOtpSentAt.getTime()) / 1000;

      if (secondsSinceLastOTP < OTP_RESEND_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(
          OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastOTP
        );

        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting another OTP`,
        });
      }
    }

    const otp = generateOTP();

    const otpHash = await hashOTP(otp);

    user.otpHash = otpHash;

    user.otpExpiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
    );

    user.otpAttempts = 0;

    user.lastOtpSentAt = new Date();

    await user.save();

    await sendOTPEmail(normalizedEmail, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Send OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "Please request a new OTP",
      });
    }

    // Check maximum attempts
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    // Check expiration
    if (user.otpExpiresAt.getTime() < Date.now()) {
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpAttempts = 0;

      await user.save();

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    const isValidOTP = await compareOTP(otp, user.otpHash);

    if (!isValidOTP) {
      user.otpAttempts += 1;

      await user.save();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Successful verification
    user.isVerified = true;

    // Delete OTP immediately
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;

    await user.save();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};