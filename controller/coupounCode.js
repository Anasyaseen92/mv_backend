const express = require("express");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const { isSeller } = require("../middleware/auth");
const CoupounCode = require("../model/coupounCode");


const router = express.Router();

// create coupon
router.post(
  "/create-coupon-code",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { name, value, minAmount, maxAmount, selectedProducts, shop } = req.body;

      // ✅ required fields only
      if (!name || !value) {
        return next(new ErrorHandler("Name and discount percentage are required!", 400));
      }

      // ✅ check duplicate for same shop
      const isCouponExists = await CoupounCode.findOne({ name, shop });
      if (isCouponExists) {
        return next(new ErrorHandler("Coupon code already exists for this shop!", 400));
      }

      // ✅ allow selectedProducts empty
     const coupon = await CoupounCode.create({
  name,
  value,
  minAmount: minAmount || null,
  maxAmount: maxAmount || null,
  selectedProducts: selectedProducts || [],
  shop,
});

      res.status(201).json({
        success: true,
        coupon,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 400));
    }
  })
);

//get all coupons of a shop

router.get(
  "/get-coupon/:id", isSeller, catchAsyncErrors(async(req,res,next) =>{
    try {
      const couponCodes = await CoupounCode.find({
       shop: req.params.id

      });

      res.status(201).json({
        success: true,
        couponCodes,
      })
    } catch (error) {
      return next( new ErrorHandler(error,400))
    }
  })
)

// delete coupoun code of a shop
router.delete(
  "/delete-coupon/:id",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const couponCode = await CoupounCode.findByIdAndDelete(req.params.id);

      if (!couponCode) {
        return next(new ErrorHandler("Coupon code dosen't exists!", 400));
      }
      res.status(201).json({
        success: true,
        message: "Coupon code deleted successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error, 400));
    }
  })
);

// get coupon code value by its name
router.get(
  "/get-coupon-value/:name",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const couponCode = await CoupounCode.findOne({ name: req.params.name });

      res.status(200).json({
        success: true,
        couponCode,
      });
    } catch (error) {
      return next(new ErrorHandler(error, 400));
    }
  })
);
module.exports = router;
