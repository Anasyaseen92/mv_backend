const express = require("express");
const router = express.Router();
const Product = require("../model/product");
const Shop = require("../model/shop");
const upload = require("../multer");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const {isAuthenticated} = require("../middleware/auth")
const Order = require("../model/order");
const fs = require("fs");
const cloudinary = require("../cloudinary")

//const {isSeller} = require("../middleware/auth")
// create product

router.post(
  "/create-product",
  upload.array("images", 6), // max 6 images
  catchAsyncErrors(async (req, res, next) => {
    try {
      const shopId = req.body.shopId;
      const shop = await Shop.findById(shopId);
      if (!shop) return next(new ErrorHandler("Shop Id is invalid", 400));

      const files = req.files;
      if (!files || files.length === 0)
        return next(new ErrorHandler("Please upload at least one image", 400));

      // Helper function to upload a single file to Cloudinary
      const uploadToCloudinary = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "product_images" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          stream.end(fileBuffer);
        });
      };

      // Upload all images
      const imageUrls = [];
      for (const file of files) {
        const url = await uploadToCloudinary(file.buffer);
        imageUrls.push(url);
      }

      // Prepare product data
      const productData = {
        ...req.body,
        images: imageUrls,
        shop: shop._id,
      };

      const product = await Product.create(productData);

      res.status(201).json({
        success: true,
        product,
      });
    } catch (error) {
      console.error("Create product error:", error);
      return next(new ErrorHandler(error.message || "Internal Server Error", 500));
    }
  })
);


// get all products of a shop

router.get(
  "/get-all-products-shop/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const products = await Product.find({ shopId: req.params.id });
      res.status(201).json({
        success: true,
        products,
      });
    } catch (error) {
      return next(new ErrorHandler(error, 400));
    }
  })
);



// delete product of a shop
router.delete(
  "/delete-shop-product/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const productId = req.params.id;

      const productData = await Product.findById(productId);

      if (!productData) {
        return next(new ErrorHandler("Product not found with this id!", 404));
      }

      // ✅ Check both `image` and `images` field (depends on schema)
      const images = productData.image || productData.images;

      if (images && images.length > 0) {
        for (const imageUrl of images) {
          const filePath = `uploads/${imageUrl}`;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // ✅ delete image from uploads
          }
        }
      }

      // ✅ Delete product from DB
      await Product.findByIdAndDelete(productId);

      res.status(200).json({
        success: true,
        message: "Product and images deleted successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);


// get all products of all shops

router.get("/get-all-products", catchAsyncErrors( async(req,res,next) =>{
  try {
    const products = await Product.find();

    res.json({
      success: true,
      products,
    })
  } catch (error) {
    return next( new ErrorHandler(error, 400))
  }
}))

// review for a product

router.put(
  "/create-new-review",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { rating, comment, productId, orderId } = req.body;

      // ✅ Basic validation
      if (!productId || !orderId || typeof rating === "undefined") {
        return next(new ErrorHandler("Missing required fields", 400));
      }

      // ✅ Find product
      const product = await Product.findById(productId);
      if (!product) return next(new ErrorHandler("Product not found", 404));

      // ✅ Build consistent review user object (always from logged-in user)
      const reviewUser = {
        _id: req.user._id,
        name: req.user.name || "Anonymous",
        avatar: req.user.avatar || "", // ✅ make sure avatar comes from user model
      };

      const newReview = {
        user: reviewUser,
        rating: Number(rating),
        comment: comment || "",
        productId,
      };

      // ✅ Check if already reviewed
      const existingReviewIndex = product.reviews.findIndex(
        (rev) => String(rev.user._id) === String(req.user._id)
      );

      if (existingReviewIndex !== -1) {
        // ✅ Update existing review
        product.reviews[existingReviewIndex] = {
          ...product.reviews[existingReviewIndex].toObject
            ? product.reviews[existingReviewIndex].toObject()
            : product.reviews[existingReviewIndex],
          ...newReview,
        };
      } else {
        // ✅ Add new review
        product.reviews.push(newReview);
      }

      // ✅ Recalculate average rating
      const total = product.reviews.reduce(
        (sum, rev) => sum + Number(rev.rating || 0),
        0
      );
      product.ratings = product.reviews.length
        ? total / product.reviews.length
        : 0;

      await product.save({ validateBeforeSave: false });

      // ✅ Mark order item as reviewed
      await Order.updateOne(
        { _id: orderId, "cart.productId": productId },
        { $set: { "cart.$.isReviewed": true } }
      );

      return res.status(200).json({
        success: true,
        message: "Reviewed successfully!",
        reviews: product.reviews, // ✅ send back updated reviews to frontend
      });
    } catch (error) {
      console.error("create-new-review error:", error);
      return next(new ErrorHandler(error.message || "Server Error", 500));
    }
  })
);


module.exports = router;
