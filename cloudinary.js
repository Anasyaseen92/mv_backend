const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: "dcmgd4gdj",
  api_key: "194253143292324",
  api_secret: "hJ0FESqdK7BVkrG8Hgmv4A1DnRg",
});

module.exports = cloudinary;
