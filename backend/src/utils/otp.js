import crypto from "crypto";
import bcrypt from "bcryptjs";

export const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOTP = async (otp) => {
  return bcrypt.hash(otp, 10);
};

export const compareOTP = async (otp, otpHash) => {
  return bcrypt.compare(otp, otpHash);
};