
const socket = io();

const $ = (...ids) => {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
};

const joinForm = $("joinForm");
const usernameInput = $("username");
const roomInput = $("roomName", "roomCode", "accessCode");
const app = $("app");
const chatContainer = $("chat", "messages");
const peopleContainer = $("people", "participants");
const chatForm = $("chatForm", "messageForm");
const messageInput = $("messageInput", "message", "chatInput");
const micButton = $("micButton", "toggleMic", "micToggle");
const leaveButton = $("leaveButton", "leaveRoom", "leaveBtn");
const statusElement = $("voiceStatus", "connectionStatus", "status");

const RTC_CONFIG = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

let joined = false;
let localStream = null;
let microphoneEnabled = true;
let currentUsername = "";
let currentRoomCode = "";

const peerConnections = new Map();
const pendingCandidates = new Map();
const pendingOffers = new Map();
const remoteAudioElements = new Map();
const participantNames = new Map();

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
  console.log("[Voice]", message);
}

function showApp(show) {
  if (app) app.hidden = !show;
  if (joinForm) joinForm.hidden = show;
}

function addMessage(message, type = "system") {
  if (!chatContainer) {
    console.log(`[${type}]`, message);
    return;
  }

  const item = document.createElement("div");
  item.className = `message message-${type}`;
  item.textContent = message;
  chatContainer.appendChild(item);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function getParticipantName(id) {
  return participantNames.get(id) || "کاربر";
}

function renderParticipants(participants) {
  if (!Array.isArray(participants)) return;

  participantNames.clear();

  for (const person of participants) {
    if (person?.id) {
      participantNames.set(
        person.id,
        person.username || person.name || "کاربر"
      );
    }
  }

  if (peopleContainer) {
    peopleContainer.replaceChildren();

    for (const person of participants) {
      const item = document.createElement("div");
      item.className = "participant";

      const name = person.username || person.name || "کاربر";
      item.textContent = person.id === socket.id
        ? `${name} (شما)`
        : name;

      peopleContainer.appendChild(item);
    }
  }

  reconcilePeers(participants);
}

async function startMicrophone() {
  if (localStream) return localStream;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "مرورگر به میکروفون دسترسی ندارد. از HTTPS یا localhost استفاده کن."
    );
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  for (const track of localStream.getAudioTracks()) {
    track.enabled = microphoneEnabled;
  }

  if (micButton) {
    micButton.disabled = false;
    micButton.textContent = microphoneEnabled
      ? "خاموش کردن میکروفون"
      : "روشن کردن میکروفون";
  }

  await processPendingOffers();
  return localStream;
}

function createPeerConnection(peerId) {
  const existing = peerConnections.get(peerId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  peerConnections.set(peerId, pc);

  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate || !joined) return;

    socket.emit("webrtc-ice-candidate", {
      targetId: peerId,
      candidate: event.candidate
    });
  };

  pc.ontrack = (event) => {
    let audio = remoteAudioElements.get(peerId);

    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.peerId = peerId;

      // این سایت فقط صدای کاربران را پخش می‌کند.
      audio.style.display = "none";

      document.body.appendChild(audio);
      remoteAudioElements.set(peerId, audio);
    }

    if (event.streams && event.streams[0]) {
      audio.srcObject = event.streams[0];
    } else {
      let stream = audio.srcObject;

      if (!(stream instanceof MediaStream)) {
        stream = new MediaStream();
        audio.srcObject = stream;
      }

      if (!stream.getTracks().some(
        track => track.id === event.track.id
      )) {
        stream.addTrack(event.track);
      }
    }

    audio.play().catch((error) => {
      console.warn(
        "پخش خودکار صدا انجام نشد؛ صفحه را بررسی کن:",
        error
      );
      setStatus("برای شنیدن صدا، پخش صوت را در مرورگر فعال کن.");
    });
  };

  pc.onconnectionstatechange = () => {
    console.log(
      "Peer connection:",
      peerId,
      pc.connectionState,
      pc.iceConnectionState
    );

    if (pc.connectionState === "connected") {
      setStatus("اتصال صوتی برقرار شد.");
    } else if (pc.connectionState === "failed") {
      setStatus(
        "اتصال صوتی ناموفق است؛ احتمالاً به تنظیم TURN نیاز است."
      );
    } else if (pc.connectionState === "disconnected") {
      setStatus("اتصال صوتی قطع شده یا ناپایدار است.");
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(
      "ICE:",
      peerId,
      pc.iceConnectionState
    );
  };

  pc.onicecandidateerror = (event) => {
    console.warn(
      "ICE candidate error:",
      event.errorCode,
      event.errorText
    );
  };

  return pc;
}

async function reconcilePeers(participants) {
  if (!joined || !localStream || !Array.isArray(participants)) {
    return;
  }

  for (const person of participants) {
    if (!person?.id || person.id === socket.id) continue;

    let pc = peerConnections.get(person.id);

    if (pc && pc.connectionState === "closed") {
      removePeer(person.id);
      pc = null;
    }

    if (!pc) {
      pc = createPeerConnection(person.id);
    }

    // فقط یکی از دو کاربر پیشنهاد اتصال را ایجاد می‌کند.
    // این کار از ایجاد هم‌زمان دو offer جلوگیری می‌کند.
    if (
      socket.id.localeCompare(person.id) > 0 &&
      pc.signalingState === "stable" &&
      !pc.localDescription
    ) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("webrtc-offer", {
          targetId: person.id,
          description: pc.localDescription
        });
      } catch (error) {
        console.error("ساخت offer ناموفق بود:", error);
      }
    }
  }
}

async function addPendingCandidates(peerId, pc) {
  const candidates = pendingCandidates.get(peerId) || [];
  pendingCandidates.delete(peerId);

  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("افزودن ICE candidate ناموفق بود:", error);
    }
  }
}

async function processOffer(peerId, description) {
  if (!joined || !peerId || !description) return;

  if (!localStream) {
    pendingOffers.set(peerId, description);
    return;
  }

  let pc = peerConnections.get(peerId);

  if (!pc || pc.connectionState === "closed") {
    pc = createPeerConnection(peerId);
  }

  try {
    // اگر offer هم‌زمان دریافت شده باشد، اتصال قبلی را
    // به حالت پایدار برمی‌گردانیم.
    if (pc.signalingState === "have-local-offer") {
      await pc.setLocalDescription({ type: "rollback" });
    }

    await pc.setRemoteDescription(
      new RTCSessionDescription(description)
    );

    await addPendingCandidates(peerId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      targetId: peerId,
      description: pc.localDescription
    });
  } catch (error) {
    console.error("پردازش offer ناموفق بود:", error);
    setStatus("برقراری اتصال صوتی ناموفق بود؛ کنسول را بررسی کن.");
  }
}

async function processPendingOffers() {
  const offers = [...pendingOffers.entries()];
  pendingOffers.clear();

  for (const [peerId, description] of offers) {
    await processOffer(peerId, description);
  }
}

function removePeer(peerId) {
  const pc = peerConnections.get(peerId);

  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.close();
    peerConnections.delete(peerId);
  }

  pendingCandidates.delete(peerId);
  pendingOffers.delete(peerId);
  participantNames.delete(peerId);

  const audio = remoteAudioElements.get(peerId);

  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    remoteAudioElements.delete(peerId);
  }
}

socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
  setStatus("اتصال به سرور برقرار نشد.");
});

socket.on("join-success", async (data) => {
  joined = true;
  showApp(true);

  if (data?.message) addMessage(data.message);

  try {
    await startMicrophone();
    setStatus("میکروفون آماده است؛ در انتظار اتصال کاربران.");
    socket.emit("request-participants");
  } catch (error) {
    console.error("دسترسی به میکروفون ناموفق بود:", error);
    setStatus(
      "دسترسی به میکروفون برقرار نشد. مجوز میکروفون مرورگر را بررسی کن."
    );
  }
});

socket.on("join-error", (data) => {
  const message = typeof data === "string"
    ? data
    : data?.message || "ورود به اتاق ناموفق بود.";

  addMessage(message, "error");
  setStatus(message);
});

socket.on("participants", (participants) => {
  renderParticipants(participants);
});

socket.on("system-message", (data) => {
  const message = typeof data === "string"
    ? data
    : data?.message || "";

  if (message) addMessage(message, "system");
});

socket.on("chat-message", (data) => {
  if (typeof data === "string") {
    addMessage(data, "chat");
    return;
  }

  const name = data?.username || data?.name || "کاربر";
  const message = data?.message || data?.text || "";

  if (message) addMessage(`${name}: ${message}`, "chat");
});

socket.on("webrtc-offer", async (data) => {
  const peerId = data?.fromId;
  const description = data?.description;

  if (!peerId || !description) return;

  await processOffer(peerId, description);
});

socket.on("webrtc-answer", async (data) => {
  const peerId = data?.fromId;
  const description = data?.description;

  if (!peerId || !description) return;

  const pc = peerConnections.get(peerId);

  if (!pc) {
    console.warn("Answer received without peer connection:", peerId);
    return;
  }

  try {
    if (pc.signalingState !== "have-local-offer") {
      console.warn(
        "Answer received in unexpected state:",
        pc.signalingState
      );
      return;
    }

    await pc.setRemoteDescription(
      new RTCSessionDescription(description)
    );

    await addPendingCandidates(peerId, pc);
  } catch (error) {
    console.error("پردازش answer ناموفق بود:", error);
  }
});

socket.on("webrtc-ice-candidate", async (data) => {
  const peerId = data?.fromId;
  const candidate = data?.candidate;

  if (!peerId || !candidate) return;

  const pc = peerConnections.get(peerId);

  if (!pc || !pc.remoteDescription) {
    if (!pendingCandidates.has(peerId)) {
      pendingCandidates.set(peerId, []);
    }

    pendingCandidates.get(peerId).push(candidate);
    return;
  }

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("افزودن ICE candidate ناموفق بود:", error);
  }
});

socket.on("user-left", (data) => {
  if (data?.id) removePeer(data.id);
  if (data?.socketId) removePeer(data.socketId);
});

socket.on("disconnect", () => {
  setStatus("اتصال به سرور قطع شد.");
});

if (joinForm) {
  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (joined) return;

    currentUsername = usernameInput?.value.trim() || "";
    currentRoomCode = roomInput?.value.trim() || "";

    if (!currentUsername || !currentRoomCode) {
      setStatus("نام و کد ورود را وارد کن.");
      return;
    }

    try {
      await startMicrophone();

      socket.emit("join-room", {
        username: currentUsername,
        name: currentUsername,
        roomCode: currentRoomCode,
        roomCodeInput: currentRoomCode,
        code: currentRoomCode
      });
    } catch (error) {
      console.error("Microphone permission error:", error);
      setStatus("ابتدا مجوز استفاده از میکروفون را فعال کن.");
    }
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const message = messageInput?.value.trim();
    if (!message || !joined) return;

    socket.emit("chat-message", { message, text: message });

    if (messageInput) messageInput.value = "";
  });
}

if (micButton) {
  micButton.disabled = true;

  micButton.addEventListener("click", () => {
    if (!localStream) return;

    microphoneEnabled = !microphoneEnabled;

    for (const track of localStream.getAudioTracks()) {
      track.enabled = microphoneEnabled;
    }

    micButton.textContent = microphoneEnabled
      ? "خاموش کردن میکروفون"
      : "روشن کردن میکروفون";

    setStatus(
      microphoneEnabled
        ? "میکروفون روشن است."
        : "میکروفون خاموش است."
    );
  });
}

async function leaveRoom() {
  if (!joined) return;

  joined = false;
  socket.emit("leave-room");

  for (const peerId of [...peerConnections.keys()]) {
    removePeer(peerId);
  }

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }

    localStream = null;
  }

  pendingOffers.clear();
  pendingCandidates.clear();
  participantNames.clear();

  if (peopleContainer) peopleContainer.replaceChildren();

  if (chatContainer) chatContainer.replaceChildren();

  showApp(false);
  setStatus("از اتاق خارج شدی.");
}

if (leaveButton) {
  leaveButton.addEventListener("click", leaveRoom);
}

window.addEventListener("beforeunload", () => {
  for (const pc of peerConnections.values()) {
    pc.close();
  }

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }
});
