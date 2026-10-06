export const sendOTPEmail = async (email, otp) => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",

    headers: {
      accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },

    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME,
        email: process.env.BREVO_SENDER_EMAIL,
      },

      to: [
        {
          email,
        },
      ],

      subject: "Your Hackathon Verification Code",

      textContent: `Your verification code is ${otp}. This code will expire in 5 minutes.`,

      htmlContent: `
        <div style="font-family: Arial, sans-serif;">
          <h2>College Hackathon</h2>

          <p>Your verification code is:</p>

          <h1>${otp}</h1>

          <p>This code will expire in 5 minutes.</p>

          <p>If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();

    throw new Error(`Brevo email failed: ${errorData}`);
  }

  return response.json();
};