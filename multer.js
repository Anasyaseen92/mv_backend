const multer = require("multer");

// Use memory storage for Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = upload;
