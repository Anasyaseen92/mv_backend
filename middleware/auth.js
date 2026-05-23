const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("./catchAsyncErrors");
const jwt= require("jsonwebtoken");
const User = require ("../model/user");
const Shop = require("../model/shop")
exports.isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return next(new ErrorHandler("Please login to continue", 401));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

  req.user = await User.findById(decoded.id);
  if (!req.user) {
    return next(new ErrorHandler("User not found", 401));
  }

  next();
});

// for seller
exports.isSeller = catchAsyncErrors(async (req, res, next) => {
  let token = req.cookies?.seller_token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return next(new ErrorHandler("Please login to continue", 401));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

  req.seller = await Shop.findById(decoded.id);
  if (!req.seller) {
    return next(new ErrorHandler("Seller not found", 401));
  }

  next();
});
