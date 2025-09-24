const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const User = require("../model/user");
const router = express.Router();
const upload = require("../multer");
const ErrorHandler = require("../utils/ErrorHandler");
const sendMail = require("../utils/sendMail");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const sendToken = require("../utils/jwtToken");
const { isAuthenticated } = require("../middleware/auth");
const cloudinary = require("../cloudinary")

// ========== Create User Route ==========
router.post("/create-user", upload.single("file"), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // check if user exists
    const userEmail = await User.findOne({ email });
    if (userEmail) return next(new ErrorHandler("User already exists", 400));

    let avatarUrl = "";

    // upload to Cloudinary if file exists
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload_stream(
          { folder: "user_avatars" },
          (error, result) => {
            if (error) throw error;
            avatarUrl = result.secure_url;
          }
        ).end(req.file.buffer);

        // Actually, better way is to wrap upload_stream in a Promise:
        avatarUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "user_avatars" },
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

    const user = {
      name,
      email,
      password,
      avatar: avatarUrl, // Save Cloudinary URL
    };

    // Create activation token
    const activationToken = createActivationToken(user);
    console.log("Activation token (copy for Postman):", activationToken);
    const activationUrl = `http://localhost:5173/activation/${activationToken}`;

    // Send activation email
    try {
      await sendMail({
        email: user.email,
        subject: "Activate Your Account",
        message: `Hello ${user.name},\n\nPlease click the link below to activate your account:\n${activationUrl}`,
      });

      return res.status(201).json({
        success: true,
        message: `Please check your email (${user.email}) to activate your account!`,
        avatar: avatarUrl,
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      return next(new ErrorHandler("Email sending failed", 500));
    }
  } catch (err) {
    return next(new ErrorHandler(err.message, 500));
  }
});

// ========== Create Activation Token ==========
const createActivationToken = (user) => {
  return jwt.sign(user, process.env.ACTIVATION_SECRET, {
    expiresIn: "15m", // 15 minutes for testing
  });
};

// ========== Activate User Route ==========
router.post(
  "/activation",
  catchAsyncErrors(async (req, res, next) => {
    console.log("Received token:", req.body.activation_token);
    const { activation_token } = req.body;

    let newUser;
    try {
      newUser = jwt.verify(activation_token, process.env.ACTIVATION_SECRET);
    } catch (err) {
      console.error("JWT Verification Failed:", err);
      return next(new ErrorHandler("Activation token expired or invalid", 400));
    }

    const { name, email, password, avatar } = newUser;
    console.log("Decoded User:", newUser); // <-- Confirm data here

    let existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("User already exists in DB");
      return next(new ErrorHandler("User already exists", 400));
    }

    try {
      const user = await User.create({ name, email, avatar, password, });
      console.log("User created:", user);
      sendToken(user, 201, res);
      
    } catch (createErr) {
      console.error("User creation error:", createErr);
      return next(new ErrorHandler("Failed to create user", 500));
    }
  })
);

//login API

router.post("/login-user", catchAsyncErrors(async(req, res, next)=>{
  try {
    const {email,password} = req.body;
if(!email || !password){
  return next(new ErrorHandler("Please provide the all fields!", 400));
}

const user = await User.findOne({email}).select("+password");
    if(!user){
      return next(new ErrorHandler("User does not exist", 400));
    }

    const isPasswordValid = await user.comparePassword(password);

    if(!isPasswordValid) {
      return next(new ErrorHandler("Please provide the correct information", 400));
    }

    sendToken(user, 201, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
}))

//load user
router.get("/getuser" , isAuthenticated, catchAsyncErrors(async(req, res,next)=>{
  try {
    const user = await User.findById(req.user.id);

    if(!user){
      return next(new ErrorHandler("User doesn't exists", 400));
    }

    res.status(200).json({
      success:true,
      user,
    })
  } catch (error) {
    return next(new ErrorHandler(error.message, 500))
  }
}))

//logoout user

router.get("/logout", isAuthenticated,catchAsyncErrors(async(req,res,next) =>{
  try {
    res.cookie("token",null,{
      expires: new Date(Date.now()),
      httpOnly: true,
    });

    res.status(201).json({
      success:true,
      message:"Log out successfull"
    });
  } catch (error) {
    return next(new ErrorHandler(error.message,500))
  }
}))

//user info update
router.put(
  "/update-user-info",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { email, password, phoneNumber, name } = req.body;

      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorHandler("User not found", 400));
      }

      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return next(
          new ErrorHandler("Please provide the correct information", 400)
        );
      }

      user.name = name;
      user.email = email;
      user.phoneNumber = phoneNumber;

      await user.save();

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

//update user avatar
router.put(
  "/update-avatar",
  isAuthenticated,
  upload.single("avatar"), // multer middleware (field name: "avatar")
  catchAsyncErrors(async (req, res, next) => {
    try {
      const existsUser = await User.findById(req.user.id);

      if (req.file) {
        // delete old avatar file if exists (safe check)
        if (existsUser.avatar) {
          const oldPath = path.join(__dirname, "..", "uploads", existsUser.avatar);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }

        // save new filename in DB
        existsUser.avatar = req.file.filename;
        await existsUser.save();
      }

      res.status(200).json({
        success: true,
        user: existsUser,
      });
    } catch (error) {
      console.error("Update avatar error:", error);
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

//update user address

router.put(
  "/update-user-addresses",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);

      const sameTypeAddress = user.addresses.find(
        (address) => address.addressType === req.body.addressType
      );
      if (sameTypeAddress) {
        return next(
          new ErrorHandler(`${req.body.addressType} address already exists`)
        );
      }

      const existsAddress = user.addresses.find(
        (address) => address._id === req.body._id
      );

      if (existsAddress) {
        Object.assign(existsAddress, req.body);
      } else {
        // add the new address to the array
        user.addresses.push(req.body);
      }

      await user.save();

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// delete user address
router.delete(
  "/delete-user-address/:id",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const userId = req.user._id;
      const addressId = req.params.id;

      await User.updateOne(
        {
          _id: userId,
        },
        { $pull: { addresses: { _id: addressId } } }
      );

      const user = await User.findById(userId);

      res.status(200).json({ success: true, user });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// update user password
router.put(
  "/update-user-password",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select("+password");

      const isPasswordMatched = await user.comparePassword(
        req.body.oldPassword
      );

      if (!isPasswordMatched) {
        return next(new ErrorHandler("Old password is incorrect!", 400));
      }

      if (req.body.newPassword !== req.body.confirmPassword) {
        return next(
          new ErrorHandler("Password doesn't matched with each other!", 400)
        );
      }
      user.password = req.body.newPassword;

      await user.save();

      res.status(200).json({
        success: true,
        message: "Password updated successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// find user infoormation with the userId
router.get(
  "/user-info/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);
module.exports = router;
