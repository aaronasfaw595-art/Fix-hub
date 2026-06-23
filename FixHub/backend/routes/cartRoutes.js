const express = require("express");
const router = express.Router();
const Cart = require("../models/cart");
const Product = require("../models/product");
const Notification = require("../models/notification");

router.get("/test", (req, res) => {
  res.json({ message: "Cart route working" });
});
router.get("/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });

    if (!cart) {
      return res.json({ items: [] });
    }

    res.json(cart);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Cart error" });
  }
});

router.post("/add", async (req, res) => {
  console.log("🔥 CART ADD CALLED");
  const { userId, product } = req.body;

  let cart = await Cart.findOne({ userId });

  if (!cart) {
    cart = new Cart({ userId, items: [] });
  }

  let item = cart.items.find((i) => i.productId === product.productId);

  if (item) {
    item.qty += 1;
  } else {
    cart.items.push(product);
  }

  await cart.save();

  const fullProduct = await Product.findById(product.productId);

  console.log("FULL PRODUCT:", fullProduct);

  if (fullProduct && fullProduct.owner) {
    await Notification.create({
      userEmail: fullProduct.owner,
      from: userId,
      productId: fullProduct._id,
      productName: fullProduct.name,
      type: "cart",
      seen: false,
    });

    console.log("NOTIFICATION CREATED ✅");
    console.log("PRODUCT ID RECEIVED:", product.productId);
  }

  res.json(cart);
});
router.post("/remove", async (req, res) => {
  const { userId, productId } = req.body;

  const cart = await Cart.findOne({ userId });

  if (!cart) return res.json({ items: [] });

  cart.items = cart.items.filter((item) => item.productId !== productId);

  await cart.save();

  res.json(cart);
});

module.exports = router;
