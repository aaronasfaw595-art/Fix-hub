const express = require("express");
const path = require("path");
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { registerUser, loginUser } = require("../controllers/authController");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login/register attempts, please try again later.",
  skipSuccessfulRequests: true,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, Date.now() + "-" + name + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, WebP allowed."));
    }
  },
});

const validateRegister = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("role")
    .isIn(["Customer", "Seller", "Technician"])
    .withMessage("Invalid role"),
  body("firstName")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("First name too long"),
  body("lastName")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Last name too long"),
  body("phone")
    .optional()
    .trim()
    .matches(/^[0-9\-\+\s()]+$/)
    .withMessage("Invalid phone format"),
  body("birthDate").optional().isISO8601().withMessage("Invalid date format"),
  body("bio")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Bio too long"),
];

const validateLogin = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 1 }).withMessage("Password required"),
];

router.get("/", (req, res) => {
  res.json({ message: "Auth route working 🚀" });
});

router.post(
  "/register",
  authLimiter,
  upload.single("profileImage"),
  validateRegister,
  registerUser,
);

router.post("/login", authLimiter, validateLogin, loginUser);

module.exports = router;
