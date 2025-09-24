const express = require("express");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const upload = require("../multer");
const Shop = require("../model/shop");
const Event = require("../model/event")
const ErrorHandler = require("../utils/ErrorHandler");
const { isSeller } = require("../middleware/auth");
const router =  express.Router();
const fs = require("fs");
const cloudinary = require("../cloudinary")


router.post(
  "/create-event",
  upload.array("images", 6), // Limit: max 6 images
  catchAsyncErrors(async (req, res, next) => {
    const shopId = req.body.shopId;
    const shop = await Shop.findById(shopId);

    if (!shop) return next(new ErrorHandler("Shop Id is invalid", 400));

    const files = req.files;
    if (!files || files.length === 0)
      return next(new ErrorHandler("Please upload at least one image", 400));

    // Upload all images to Cloudinary
    const imageUrls = await Promise.all(
      files.map((file) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "event_images" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          stream.end(file.buffer);
        })
      )
    );

    // Prepare event data
    const eventData = {
      ...req.body,
      images: imageUrls, // Array of Cloudinary URLs
      shop: shop._id,
    };

    const event = await Event.create(eventData);

    res.status(201).json({
      success: true,
      event,
    });
  })
);

// get all events of a shop

router.get(
  "/get-all-events/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const events = await Event.find({ shopId: req.params.id });
      res.status(201).json({
        success: true,
        events,
      });
    } catch (error) {
      return next(new ErrorHandler(error, 400));
    }
  })
);

// delete event of a shop

router.delete(
  "/delete-shop-event/:id",
 isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const eventId = req.params.id;

      const eventData = await Event.findById(eventId);
     
 eventData.images.forEach((imageUrls) => {
  const filename = imageUrls;
  const filePath = `uploads/${filename}`;

  fs.unlink(filePath, (err) =>{
    if(err){
      console.log(err);
    }
  });
 });
 const event = await Event.findByIdAndDelete(eventId);
  if (!event) {
        return next(new ErrorHandler("Event not found with this id!", 500));
      }
      res.status(201).json({
        success: true,
        message : "Event Deleted Successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error, 400));
    }
  })
);

//get all events of all shops 


router.get(
  "/get-all-events",
  catchAsyncErrors(async (req, res, next) => {
    try {
     
      const events = await Event.find();
  
      res.json({
        success: true,
        events,
      });
    } catch (error) {
      console.log(error);
      return next(new ErrorHandler(error, 400));
    }
  })
);
module.exports = router;