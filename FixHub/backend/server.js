const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
dotenv.config();

const app = express();

// Base Middleware
app.use(helmet());
app.use(express.json()); // Ensures backend can parse incoming JSON bodies

// Global Rate Limiter Configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // CRITICAL: Prevent preflight OPTIONS requests from being rate-limited or blocked
  skip: (req) => req.method === 'OPTIONS', 
});
app.use(limiter);

// Clean CORS Policy setup
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://fix-hub-frontend.onrender.com" 
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Intercept Preflight OPTIONS requests and answer them immediately 
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', 'https://fix-hub-frontend.onrender.com');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.sendStatus(200);
  }
  next();
});

// Single Unified Security Headers block (replaces both older blocks)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https://fix-hub-frontend.onrender.com https://fix-hub-backend.onrender.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com"
  );
  next();
});

// Routes
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const providerRoutes = require("./routes/providerRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const cartRoutes = require("./routes/cartRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

app.use("/api/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/providers", providerRoutes);
app.use("/orders", orderRoutes);
app.use("/payment", paymentRoutes);
app.use("/messages", messageRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/cart", cartRoutes);
app.use("/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.send("FixHub API is running 🚀");
});

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected 🚀"))
  .catch((err) => console.log(err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
