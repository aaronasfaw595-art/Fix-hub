const express = require("express");
const router = express.Router();
const Order = require("../models/order");

router.get("/test", (req, res) => {
  res.json({ message: "Order route working 🚀" });
});

router.post("/", async (req, res) => {
  try {
    const order = await Order.create(req.body);
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:user", async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.user });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
