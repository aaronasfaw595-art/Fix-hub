const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: String,
    price: Number,
    image: String,
    owner: String,
    description: String,
    details: String,
    comments: [
      {
        userEmail: String,
        userName: String,
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

productSchema.index({ owner: 1, createdAt: -1 });
productSchema.index({ name: 1 });

module.exports = mongoose.model("Product", productSchema);
