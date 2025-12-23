import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";


//Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

//Socket.io setup
export const io = new Server(server, {
  cors: {
    origin: "https://mern-chat-1-vxzp.onrender.com",
    methods: ["GET", "POST"],
  },
});


//Store online users
export const userSocketMap = {};

//Middleware setup
app.use(express.json({ limit: "4mb" }));
const allowedOrigins = [
  "https://mern-chat-1-vxzp.onrender.com"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "token"],
  })
);

// VERY IMPORTANT (for preflight)
app.options("*", cors());


//Socket.io connection
io.on("connection", (socket) => {
  const token = socket.handshake.auth.token;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.userId;

  console.log("User Connected", userId);

  if (userId) {
    userSocketMap[userId] = socket.id;
    // Broadcast updated online users list to all clients
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  }

  socket.on("disconnect", () => {
    console.log("User Disconnected", userId);
    if (userId) {
      delete userSocketMap[userId];
      // Broadcast updated online users list to all clients
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

//Routes setup
app.use("/api/status", (req, res) => {
  res.send("Server is live");
});
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

await connectDB();

const PORT = process.env.PORT || 5000;

// If Railway or local environment, start listening
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
//Export server for vercel
export default server;
