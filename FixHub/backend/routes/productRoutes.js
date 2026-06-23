const express = require("express");
const router = express.Router();
const Product = require("../models/product");
const Notification = require("../models/notification");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (err) {
    console.error("PRODUCT LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load products" });
  }
});
router.get("/test", (req, res) => {
  res.json({ ok: true });
});
router.delete("/:id", async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Product deleted",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
});
router.put("/:id", async (req, res) => {
  const updated = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  res.json(updated);
});

router.post("/:id/comments", async (req, res) => {
  try {
    const { userEmail, userName, text, role } = req.body;

    if (!userEmail || !text) {
      return res
        .status(400)
        .json({ success: false, message: "Missing comment details" });
    }

    if (String(role || "").toLowerCase() !== "customer") {
      return res
        .status(403)
        .json({ success: false, message: "Only customers can post comments" });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    product.comments = product.comments || [];
    product.comments.unshift({
      userEmail,
      userName: userName || userEmail,
      text: String(text).trim(),
      createdAt: new Date(),
    });

    await product.save();

    if (product.owner) {
      const receiverEmail = String(product.owner).trim();
      if (
        receiverEmail.toLowerCase() !== String(userEmail).trim().toLowerCase()
      ) {
        try {
          await Notification.create({
            userEmail: receiverEmail,
            receiverEmail,
            from: userEmail,
            commentText: String(text).trim(),
            message: `${userName || userEmail} commented on your product: ${String(text).trim()}`,
            type: "comment",
            productId: product._id,
            productName: product.name || "product",
            seen: false,
          });
        } catch (notifyErr) {
          console.error("Product comment notification failed:", notifyErr);
        }
      }
    }

    res.json({ success: true, comments: product.comments });
  } catch (error) {
    console.error("Product comment error:", error);
    res.status(500).json({ success: false, message: "Failed to save comment" });
  }
});

router.post("/", upload.single("image"), async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILE:", req.file);

    const details = req.body.details || req.body.description || "";

    const product = await Product.create({
      name: req.body.name,
      price: req.body.price,
      description: details,
      details,
      owner: req.body.owner,
      image: req.file ? req.file.filename : null,
    });

    res.json(product);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Product creation failed" });
  }
});

module.exports = router;
