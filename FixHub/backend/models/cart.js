const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    userId: String,
    items: [
      {
        productId: String,
        name: String,
        price: Number,
        image: String,
        qty: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Cart", cartSchema);
