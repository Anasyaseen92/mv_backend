// backend/routes/messages.js
const Messages = require("../model/messages");
const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const express = require("express");
const router = express.Router();
const upload = require("../multer");

router.post("/create-new-message", async (req, res, next) => {
  try {
    const messageData = {
      conversationId: req.body.conversationId,
      sender: req.body.sender,
      text: req.body.text || "",
    };

    // Store image URL from frontend if provided
    if (req.body.images) {
      messageData.images = req.body.images; // just store the URL
    }

    const message = new Messages(messageData);
    await message.save();

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error("🚨 Backend error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});


// get all messages with conversation id
router.get(
  "/get-all-messages/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const messages = await Messages.find({
        conversationId: req.params.id,
      });

      res.status(201).json({
        success: true,
        messages,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message), 500);
    }
  })
);

module.exports = router;