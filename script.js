"use strict";

const socket = io();
const $ = (selector) => document.querySelector(selector);

const joinForm = $("#joinForm");
const nameInput = $("#username");
const roomCodeInput = $("#roomCode");
const joinScreen = $("#joinScreen");
const app = $("#app");

const roomLabel = $("#roomLabel");
const localName = $("#localName");
const participantCount = $("#participantCount");
const tabCount = $("#tabCount");
const peopleCount = $("#peopleCount");
const peopleList = $("#peopleList");
const peopleListMirror = $("#peopleListMirror");

const chatForm = $("#chatForm");
const messageInput = $("#messageInput");
const messages = $("#messages");

const micButton = $("#micButton");
const micText = $("#micText");
const endButton = $("#endButton");
const statusMessage = $("#statusMessage");
const toast = $("#toast");
const remoteAudios = $("#remoteAudios");

let displayName = "";
let currentRoomName = "";
let joined = false;
let localStream = null;
let micEnabled = true;
let toastTimer = null;

// peerId -> RTCPeerConnection
const peerConnections = new Map();
// peerId -> ICE candidates waiting for remote description
const pendingCandidates = new Map();

const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

function setStatus(text) {
  if (statusMessage) statusMessage.textContent = text;
}

function showToast(text) {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setParticipantCount(count) {
  [participantCount, tabCount, peopleCount].forEach((element) => {
    if (element) element.textContent = String(count);
  });
}

function clearWelcomeMessage() {
  const welcome = messages?.querySelector(".welcome-message");
  welcome?.remove();
}

function addMessage(name, text, isOwn = false) {
  if (!messages) return;
  clearWelcomeMessage();

  const message = document.createElement("div");
  message.className = isOwn ? "message message-own" : "message";

  const header = document.createElement("div");
  header.className = "message-header";

  const sender = document.createElement("span");
  sender.className = "message-sender";
  sender.textContent = name || "کاربر";

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = text;

  header.append(sender, time);
  message.append(header, body);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function addWelcomeMessage() {
  if (!messages) return;
  messages.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "welcome-message";

  const icon = document.createElement("div");
  icon.className = "welcome-icon";
  icon.textContent = "✦";

  const title = document.createElement("strong");
  title.textContent = "به گفت‌وگو خوش آمدی";

  const description = document.createElement("p");
  description.textContent = "پیام‌ها برای اعضای همین اتاق ارسال می‌شوند.";

  wrapper.append(icon, title, description);
  messages.append(wrapper);
}

function makePerson(name, isYou) {
  const item = document.createElement("div");
  item.className = "person";

  const personAvatar = document.createElement("div");
  personAvatar.className = "person-avatar";
  personAvatar.textContent = (name || "?").charAt(0);

  const info = document.createElement("div");
  info.className = "person-info";

  const title = document.createElement("div");
  title.className = "person-name";
  title.textContent = name || "کاربر";

  const subtitle = document.createElement("div");
  subtitle.className = "person-status";
  subtitle.textContent = isYou ? "شما" : "در اتاق حاضر است";

  info.append(title, subtitle);
  item.append(personAvatar, info);
  return item;
}

function renderParticipants(participants) {
  if (!Array.isArray(participants)) return;

  const renderList = (container) => {
    if (!container) return;
    container.replaceChildren();

    participants.forEach((person) => {
      container.append(
        makePerson(person.name, person.id === socket.id)
      );
    });
  };

  renderList(peopleList);
  renderList(peopleListMirror);
  setParticipantCount(participants.length);

  // هر دو طرف باید یک اتصال برای هر هم‌اتاقی داشته باشند.
  reconcilePeers(participants);
}

function updateMicButton() {
  if (micText) {
    micText.textContent = micEnabled
      ? "خاموش کردن میکروفون"
      : "روشن کردن میکروفون";
  }

  if (micButton) {
    micButton.classList.toggle("active", !micEnabled);
  }
}

async function startMicrophone() {
  if (localStream) return true;

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("میکروفون در این محیط در دسترس نیست. از HTTPS یا localhost استفاده کن.");
    return false;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled;
    });

    updateMicButton();
    setStatus("میکروفون آماده است؛ در حال اتصال به اعضا...");
    await reconcilePeersFromServerState();
    return true;
  } catch (error) {
    console.error("Microphone access error:", error);
    setStatus("دسترسی به میکروفون ممکن نشد. اجازهٔ میکروفون مرورگر را بررسی کن.");
    showToast("برای صحبت کردن باید اجازهٔ میکروفون بدهی.");
    return false;
  }
}

// آخرین فهرست اعضا که از سرور دریافت شده
let latestParticipants = [];

async function reconcilePeersFromServerState() {
  if (latestParticipants.length) {
    await reconcilePeers(latestParticipants);
  }
}

async function reconcilePeers(participants) {
  latestParticipants = participants;

  if (!joined || !localStream) return;

  const currentIds = new Set(
    participants
      .map((person) => person.id)
      .filter((id) => id && id !== socket.id)
  );

  // بستن اتصال‌های مربوط به کسانی که از اتاق خارج شده‌اند
  for (const peerId of peerConnections.keys()) {
    if (!currentIds.has(peerId)) closePeer(peerId);
  }

  for (const person of participants) {
    if (!person.id || person.id === socket.id) continue;
    if (peerConnections.has(person.id)) continue;

    const pc = createPeerConnection(person.id);

    // برای جلوگیری از ایجاد offer هم‌زمان، فقط یک طرف آغازگر است.
    if (socket.id.localeCompare(person.id) > 0) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("webrtc-offer", {
          targetId: person.id,
          description: pc.localDescription
        });
      } catch (error) {
        console.error("Could not create WebRTC offer:", error);
      }
    }
  }
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(rtcConfiguration);
  peerConnections.set(peerId, pc);

  localStream.getAudioTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        targetId: peerId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    let audio = document.getElementById(`remote-audio-${peerId}`);

    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `remote-audio-${peerId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      remoteAudios.append(audio);
    }

    if (event.streams && event.streams[0]) {
      audio.srcObject = event.streams[0];
    }

    audio.play().catch((error) => {
      console.warn("Audio playback needs user interaction:", error);
      showToast("برای شنیدن صدا، یک بار روی صفحه ضربه بزن.");
    });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      setStatus("اتصال صوتی ناموفق بود؛ ممکن است شبکه به تنظیم TURN نیاز داشته باشد.");
    }
  };

  pc.onicecandidateerror = (event) => {
    console.warn("ICE candidate error:", event);
  };

  return pc;
}

function closePeer(peerId) {
  const pc = peerConnections.get(peerId);

  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.close();
    peerConnections.delete(peerId);
  }

  const audio = document.getElementById(`remote-audio-${peerId}`);
  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audio.remove();
  }

  pendingCandidates.delete(peerId);
}

async function addPendingCandidates(peerId, pc) {
  const candidates = pendingCandidates.get(peerId) || [];
  pendingCandidates.delete(peerId);

  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn("Could not add queued ICE candidate:", error);
    }
  }
}

// ورود به اتاق؛ کد توسط سرور اعتبارسنجی می‌شود
joinForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if (!name || !roomCode) {
    showToast("نام و کد اتاق را وارد کن.");
    return;
  }

  if (!socket.connected) {
    showToast("اتصال به سرور برقرار نیست.");
    return;
  }

  displayName = name;
  joined = false;
  setStatus("در حال بررسی کد اتاق...");

  socket.emit("join-room", {
    name: displayName,
    roomCode
  });
});

socket.on("join-success", async (data) => {
  joined = true;
  currentRoomName = data.roomName;

  if (joinScreen) joinScreen.style.display = "none";
  if (app) app.classList.remove("hidden");

  if (roomLabel) roomLabel.textContent = data.roomLabel || "اتاق گفت‌وگو";
  if (localName) localName.textContent = displayName;

  setStatus("برای صحبت، اجازهٔ میکروفون را تأیید کن.");
  await startMicrophone();
});

socket.on("join-error", (message) => {
  joined = false;
  setStatus("ورود به اتاق انجام نشد.");
  showToast(message || "ورود به اتاق ممکن نشد.");
});

socket.on("participants", (participants) => {
  renderParticipants(participants);
});

socket.on("chat-message", (message) => {
  if (!message || typeof message.text !== "string") return;

  addMessage(
    message.name,
    message.text,
    message.id === socket.id
  );
});

socket.on("system-message", (message) => {
  if (message && typeof message.text === "string") {
    addMessage("سیستم", message.text);
  }
});

socket.on("webrtc-offer", async (data) => {
  if (!joined || !localStream || !data?.fromId || !data.description) return;

  try {
    let pc = peerConnections.get(data.fromId);

    if (!pc) {
      pc = createPeerConnection(data.fromId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(data.description));
    await addPendingCandidates(data.fromId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      targetId: data.fromId,
      description: pc.localDescription
    });
  } catch (error) {
    console.error("Could not process WebRTC offer:", error);
  }
});

socket.on("webrtc-answer", async (data) => {
  if (!data?.fromId || !data.description) return;

  const pc = peerConnections.get(data.fromId);
  if (!pc) return;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(data.description));
    await addPendingCandidates(data.fromId, pc);
  } catch (error) {
    console.error("Could not process WebRTC answer:", error);
  }
});

socket.on("webrtc-ice-candidate", async (data) => {
  if (!data?.fromId || !data.candidate) return;

  const candidate = new RTCIceCandidate(data.candidate);
  const pc = peerConnections.get(data.fromId);

  if (!pc || !pc.remoteDescription) {
    const queue = pendingCandidates.get(data.fromId) || [];
    queue.push(candidate);
    pendingCandidates.set(data.fromId, queue);
    return;
  }

  try {
    await pc.addIceCandidate(candidate);
  } catch (error) {
    console.warn("Could not add ICE candidate:", error);
  }
});

socket.on("connect", () => {
  if (!joined) setStatus("به سرور متصل شدی؛ نام و کد اتاق را وارد کن.");
});

socket.on("connect_error", (error) => {
  console.error("Socket.IO connection error:", error);
  setStatus("اتصال به سرور برقرار نشد.");
});

socket.on("disconnect", () => {
  joined = false;

  for (const peerId of peerConnections.keys()) closePeer(peerId);

  setStatus("اتصال به سرور قطع شد. برای ورود دوباره تلاش کن.");
});

// روشن/خاموش کردن میکروفون
micButton?.addEventListener("click", async () => {
  if (!localStream && !(await startMicrophone())) return;

  micEnabled = !micEnabled;
  localStream?.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });

  updateMicButton();
  setStatus(micEnabled ? "میکروفون روشن است." : "میکروفون خاموش است.");
});

// ارسال پیام متنی
chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  if (!joined || !socket.connected) {
    showToast("ابتدا وارد اتاق شو.");
    return;
  }

  socket.emit("chat-message", text);
  messageInput.value = "";
  messageInput.focus();
});

// تب‌ها
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });

    document.querySelectorAll(".side-panel .panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== tab.dataset.panel);
    });
  });
});

function leaveRoom() {
  if (joined && socket.connected) socket.emit("leave-room");

  joined = false;
  currentRoomName = "";

  for (const peerId of peerConnections.keys()) closePeer(peerId);

  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  micEnabled = true;

  if (peopleList) peopleList.replaceChildren();
  if (peopleListMirror) peopleListMirror.replaceChildren();

  addWelcomeMessage();
  setParticipantCount(1);

  if (app) app.classList.add("hidden");
  if (joinScreen) joinScreen.style.display = "";

  if (nameInput) nameInput.value = "";
  if (roomCodeInput) roomCodeInput.value = "";

  setStatus("برای شروع، نام و کد اتاق را وارد کن.");
  updateMicButton();
}

endButton?.addEventListener("click", leaveRoom);

window.addEventListener("beforeunload", () => {
  localStream?.getTracks().forEach((track) => track.stop());
  for (const pc of peerConnections.values()) pc.close();
});
