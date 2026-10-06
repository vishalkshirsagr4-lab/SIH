import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dns from 'dns';
import authRoutes from "./routes/auth.routes.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Hackathon backend is running 🚀",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);

export default app;