const express = require("express");
const router = express.Router();
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


router.post(
  "/process",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { amount } = req.body;

      // ✅ Create PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount, // amount in cents (e.g., $10.00 = 1000)
        currency: "usd",
        metadata: {
          company: "Bit connect",
        },
      });

      console.log("Created PaymentIntent id:", paymentIntent.id);
      console.log("Client secret (backend):", paymentIntent.client_secret);

      // ✅ Send client_secret to frontend
      res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error("Stripe error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  })
);

router.get(
  "/stripeapikey",
  catchAsyncErrors(async (req, res, next) => {
    res.status(200).json({ stripeApikey: process.env.STRIPE_API_KEY });
  })
);


module.exports = router;