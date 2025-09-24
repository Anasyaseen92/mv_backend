const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");
const {  isSeller } = require("../middleware/auth");
const Shop = require("../model/shop");
const upload = require("../multer");
const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const sendShopToken = require("../utils/shopToken");
const cloudinary = require("../cloudinary");

const router = express.Router();

// ===== Create Shop - Send Activation Email =====
router.post("/create-shop", upload.single("file"), async (req, res, next) => {
  try {
    const { email } = req.body;

    // Check if email exists
    const existingSeller = await Shop.findOne({ email });
    if (existingSeller) return next(new ErrorHandler("User already exists", 400));

    let avatarUrl = "";

    // Upload to Cloudinary if file exists
    if (req.file) {
      try {
        avatarUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "shop_avatars" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          stream.end(req.file.buffer);
        });
      } catch (cloudError) {
        console.error("Cloudinary upload failed:", cloudError);
        return next(new ErrorHandler("Avatar upload failed", 500));
      }
    }

    const sellerData = {
      name: req.body.name,
      email,
      password: req.body.password,
      avatar: avatarUrl, // Save Cloudinary URL
      address: req.body.address,
      phoneNumber: req.body.phoneNumber,
      zipCode: req.body.zipCode,
    };

    // Create activation token
    const activationToken = createActivationToken(sellerData);

    // Activation URL
    const activationUrl = `http://localhost:5173/seller/activation/${activationToken}`;

    // Send activation email
    await sendMail({
      email: sellerData.email,
      subject: "Activate Your Shop",
      message: `Hello ${sellerData.name},\n\nPlease click the link below to activate your shop:\n${activationUrl}`,
    });

    res.status(201).json({
      success: true,
      message: `Please check your email (${sellerData.email}) to activate your shop!`,
      avatar: avatarUrl,
    });
  } catch (error) {
    console.error("Create shop error:", error);
    return next(new ErrorHandler(error.message || "Internal Server Error", 500));
  }
});


// Create Activation Token
const createActivationToken = (seller) => {
  if (!process.env.ACTIVATION_SECRET) {
    throw new Error("ACTIVATION_SECRET is missing in .env");
  }
  return jwt.sign(seller, process.env.ACTIVATION_SECRET, { expiresIn: "15m" });
};

// ===== Activate Shop - Save to DB =====
router.post(
  "/activation",
  catchAsyncErrors(async (req, res, next) => {
    const { activation_token } = req.body;

    let sellerData;
    try {
      sellerData = jwt.verify(activation_token, process.env.ACTIVATION_SECRET);
    } catch (err) {
      return next(new ErrorHandler("Activation token expired or invalid", 400));
    }

    const { name, email, password, avatar, zipCode, address, phoneNumber } = sellerData;

    const existingUser = await Shop.findOne({ email });
    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: "User already activated",
      });
    }

    const seller = await Shop.create({
      name,
      email,
      password,
      avatar,
      zipCode,
      address,
      phoneNumber,
    });

    sendShopToken(seller, 201, res);
  })
);


//login seller
router.post("/login-seller", catchAsyncErrors(async(req, res, next)=>{
  try {
    const {email,password} = req.body;
if(!email || !password){
  return next(new ErrorHandler("Please provide the all fields!", 400));
}

const shop = await Shop.findOne({email}).select("+password");
    if(!shop){
      return next(new ErrorHandler("User does not exist", 400));
    }

    const isPasswordValid = await shop.comparePassword(password);

    if(!isPasswordValid) {
      return next(new ErrorHandler("Please provide the correct information", 400));
    }

    sendShopToken(shop, 201, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
}))

//load seller
router.get(
  "/getSeller",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    if (!req.seller || !req.seller._id) {
      return next(new ErrorHandler("Seller not authenticated", 401));
    }

    const seller = await Shop.findById(req.seller._id);
console.log("Seller from DB:", seller);


    if (!seller) {
      return next(new ErrorHandler("User doesn't exist", 400));
    }

    res.status(200).json({
      success: true,
      seller,
    });
  })
);

//shop log out
router.get("/logout", catchAsyncErrors(async (req, res, next) => {
  try {
    res.cookie("seller_token", "", {
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
}));

//get shop info

router.get("/get-shop-info/:id", catchAsyncErrors(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || id === "null" || id === "undefined") {
      return res.status(400).json({ success: false, message: "Invalid shop ID" });
    }

    const shop = await Shop.findById(id);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    res.status(200).json({ success: true, shop });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
}));


//update shop profile pic 
router.put(
  "/update-shop-avatar",
  isSeller,
  upload.single("image"), // field name: image
  catchAsyncErrors(async (req, res, next) => {
    try {
      const existsUser = await Shop.findById(req.seller.id);

      if (!existsUser) {
        return next(new ErrorHandler("Seller not found", 404));
      }

      if (req.file) {
        // delete old avatar file if exists
        if (existsUser.avatar) {
          const oldPath = path.join(__dirname, "uploads", existsUser.avatar);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }

        // save new filename in DB
        existsUser.avatar = req.file.filename;
        await existsUser.save();
      }

      // reload updated seller
      const updatedSeller = await Shop.findById(req.seller.id);

      res.status(200).json({
        success: true,
        user: updatedSeller,
      });
    } catch (error) {
      console.error("Update avatar error:", error);
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// update seller info
router.put(
  "/update-seller-info",
  isSeller,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { name, description, address, phoneNumber, zipCode } = req.body;

      const shop = await Shop.findOne(req.seller._id);

      if (!shop) {
        return next(new ErrorHandler("User not found", 400));
      }

      shop.name = name;
      shop.description = description;
      shop.address = address;
      shop.phoneNumber = phoneNumber;
      shop.zipCode = zipCode;

      await shop.save();

      res.status(201).json({
        success: true,
        shop,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

module.exports = router;
