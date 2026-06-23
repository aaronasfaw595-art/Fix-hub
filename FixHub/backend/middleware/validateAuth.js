const jwt = require("jsonwebtoken");

const validateAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No authorization token provided",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "SECRET_KEY_CHANGE_IN_PRODUCTION",
    );

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = validateAuth;
