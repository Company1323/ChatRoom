"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e6
});

app.use(express.static(__dirname));

/*
  کدهای ورود را اینجا تغییر بده.
  کد اتاق فقط در سمت سرور بررسی می‌شود.
*/
const ROOM_CODES = Object.freeze({
  "MAN-4821": "room1",
  "MAN-7395": "room2"
});

const ROOM_LABELS = Object.freeze({
  room1: "اتاق اول",
  room2: "اتاق دوم"
});

// roomName -> Map(socketId -> { id, name })
const rooms = new Map();

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function getParticipants(roomName) {
  const room = rooms.get(roomName);
  if (!room) return [];
  return [...room.values()].map((user) => ({
    id: user.id,
    name: user.name
  }));
}

function broadcastParticipants(roomName) {
  if (!rooms.has(roomName)) return;
  io.to(roomName).emit("participants", getParticipants(roomName));
}

function leaveRoom(socket) {
  const roomName = socket.data.roomName;
  if (!roomName) return;

  const name = socket.data.name || "کاربر";
  const room = rooms.get(roomName);

  if (room) {
    room.delete(socket.id);

    socket.to(roomName).emit("system-message", {
      text: `${name} از اتاق خارج شد.`
    });

    if (room.size === 0) {
      rooms.delete(roomName);
    } else {
      broadcastParticipants(roomName);
    }
  }

  socket.leave(roomName);
  delete socket.data.roomName;
  delete socket.data.name;
}

function getTargetInSameRoom(socket, targetId) {
  if (typeof targetId !== "string") return null;

  const roomName = socket.data.roomName;
  if (!roomName) return null;

  const room = rooms.get(roomName);
  if (!room || !room.has(targetId)) return null;

  const target = io.sockets.sockets.get(targetId);
  if (!target || target.data.roomName !== roomName) return null;

  return target;
}

io.on("connection", (socket) => {
  socket.on("join-room", (data) => {
    if (!data || typeof data !== "object") {
      socket.emit("join-error", "اطلاعات ورود معتبر نیست.");
      return;
    }

    const code = String(data.roomCode || "").trim().toUpperCase();
    const roomName = ROOM_CODES[code];

    if (!roomName) {
      socket.emit("join-error", "کد اتاق اشتباه است.");
      return;
    }

    const name = cleanName(data.name);
    if (!name) {
      socket.emit("join-error", "نام خودت را وارد کن.");
      return;
    }

    // اگر کاربر قبلاً در اتاقی بوده، ابتدا خارج شود.
    leaveRoom(socket);

    if (!rooms.has(roomName)) rooms.set(roomName, new Map());

    socket.data.roomName = roomName;
    socket.data.name = name;
    socket.join(roomName);

    rooms.get(roomName).set(socket.id, {
      id: socket.id,
      name
    });

    socket.emit("join-success", {
      roomName,
      roomLabel: ROOM_LABELS[roomName],
      name
    });

    socket.to(roomName).emit("system-message", {
      text: `${name} وارد اتاق شد.`
    });

    broadcastParticipants(roomName);
    console.log(`${name} وارد ${ROOM_LABELS[roomName]} شد.`);
  });

  socket.on("chat-message", (value) => {
    const roomName = socket.data.roomName;
    if (!roomName || !rooms.get(roomName)?.has(socket.id)) return;

    const text = String(value || "").trim().slice(0, 1000);
    if (!text) return;

    io.to(roomName).emit("chat-message", {
      id: socket.id,
      name: socket.data.name,
      text,
      time: new Date().toISOString()
    });
  });

  // WebRTC signaling: offer
  socket.on("webrtc-offer", (data) => {
    if (!data || typeof data !== "object" || !data.description) return;
    const target = getTargetInSameRoom(socket, data.targetId);
    if (!target) return;

    target.emit("webrtc-offer", {
      fromId: socket.id,
      name: socket.data.name,
      description: data.description
    });
  });

  // WebRTC signaling: answer
  socket.on("webrtc-answer", (data) => {
    if (!data || typeof data !== "object" || !data.description) return;
    const target = getTargetInSameRoom(socket, data.targetId);
    if (!target) return;

    target.emit("webrtc-answer", {
      fromId: socket.id,
      description: data.description
    });
  });

  // WebRTC signaling: ICE candidates
  socket.on("webrtc-ice-candidate", (data) => {
    if (!data || typeof data !== "object" || !data.candidate) return;
    const target = getTargetInSameRoom(socket, data.targetId);
    if (!target) return;

    target.emit("webrtc-ice-candidate", {
      fromId: socket.id,
      candidate: data.candidate
    });
  });

  socket.on("leave-room", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});