const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/order");

router.post("/initialize", async (req, res) => {
  try {
    const {
      amount,
      email,
      first_name = "User",
      last_name = "Test",
      items,
    } = req.body;

    const tx_ref = "TX-" + Date.now();

    const chapaRes = await axios.post(
      "https://api.chapa.co/v1/transaction/initialize",
      {
        amount,
        currency: "ETB",
        email,
        first_name,
        last_name,
        tx_ref,
        callback_url: "http://localhost:3000/payment/callback",
        return_url: "http://localhost:3000/payment/success",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    await Order.create({
      userEmail: email,
      items: items || [],
      totalAmount: amount,
      tx_ref: tx_ref,
    });

    res.json(chapaRes.data);
  } catch (err) {
    console.log("CHAPA ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: "Payment failed",
      details: err.response?.data,
    });
  }
});

module.exports = router;
