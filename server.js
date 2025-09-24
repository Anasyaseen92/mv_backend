const app = require("./app");
const connectDatabase = require("./db/Database");
const errorMiddleware = require("./middleware/error");
const path = require("path");
const express = require("express");

// Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Middleware
app.use(errorMiddleware);
app.get("/", (req, res) => {
  res.send("✅ Backend is running on Vercel");
});


// Handling uncaught exception
process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  console.log(`Shutting down due to uncaught exception`);
});

// Config
if (process.env.NODE_ENV !== "PRODUCTION") {
  require("dotenv").config({
    path: "backend/config/.env",
  });
}

// Connect DB
connectDatabase();

// ❌ Do NOT call app.listen() on Vercel
// ✅ Instead, just export app
module.exports = app;
