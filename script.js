
"use strict";

const socket = io();

const $ = (id) => document.getElementById(id);

const joinScreen = $("joinScreen");
const joinForm = $("joinForm");
const usernameInput = $("username");
const roomCodeInput = $("roomCode");
const app = $("app");

const roomLabel = $("roomLabel");
const localName = $("localName");
const statusMessage = $("statusMessage");

const participantCount = $("participantCount");
const tabCount = $("tabCount");
const peopleCount = $("peopleCount");
const peopleList = $("peopleList");
const peopleListMirror = $("peopleListMirror");

const messages = $("messages");
const chatForm = $("chatForm");
const messageInput = $("messageInput");

const micButton = $("micButton");
const micText = $("micText");
const leaveButton = $("leaveButton");
const endButton = $("endButton");

const toastElement = $("toast");
const remoteAudios = $("remoteAudios");


const RTC_CONFIG = {
  iceServers: [
    {
      urls: "stun:stun.relay.metered.ca:80"
    },
    {
      urls: "turn:de.relay.metered.ca:80",
      username: "06381c218aece6de692832e1",
      credential: "x6YiVCGpUuvLAJva"
    },
    {
      urls: "turn:de.relay.metered.ca:80?transport=tcp",
      username: "06381c218aece6de692832e1",
      credential: "x6YiVCGpUuvLAJva"
    },
    {
      urls: "turns:de.relay.metered.ca:443?transport=tcp",
      username: "06381c218aece6de692832e1",
      credential: "x6YiVCGpUuvLAJva"
    }
  ]
};


let joined = false;
let localStream = null;
let microphoneEnabled = true;
let currentName = "";
let currentRoomCode = "";
let latestParticipants = [];
let toastTimeout = null;

const peerConnections = new Map();
const pendingCandidates = new Map();
const pendingOffers = new Map();
const remoteAudioElements = new Map();

function setStatus(text) {
  if (statusMessage) {
    statusMessage.textContent = text;
  }
  console.log("[هم‌صدا]", text);
}

function showToast(text) {
  if (!toastElement) return;

  toastElement.textContent = text;
  toastElement.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3000);
}

function showMeeting() {
  joinScreen?.classList.add("hidden");
  app?.classList.remove("hidden");
}

function showJoinScreen() {
  app?.classList.add("hidden");
  joinScreen?.classList.remove("hidden");
}

function addMessage(text, type = "system", name = "") {
  if (!messages) return;

  // پیام خوشامدگویی اولیه را هنگام دریافت اولین پیام واقعی حذف کن.
  const welcome = messages.querySelector(".welcome-message");
  if (welcome) welcome.remove();

  const item = document.createElement("div");
  item.className = `message message-${type}`;

  if (name) {
    const author = document.createElement("strong");
    author.className = "message-author";
    author.textContent = name;
    item.appendChild(author);
  }

  const content = document.createElement("div");
  content.className = "message-text";
  content.textContent = text;
  item.appendChild(content);

  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function updateParticipantCounts(count) {
  if (participantCount) participantCount.textContent = String(count);
  if (tabCount) tabCount.textContent = String(count);
  if (peopleCount) peopleCount.textContent = String(count);
}

function renderParticipants(participants) {
  if (!Array.isArray(participants)) return;

  latestParticipants = participants;

  const renderList = (container) => {
    if (!container) return;

    container.replaceChildren();

    for (const person of participants) {
      const item = document.createElement("div");
      item.className = "participant-item";

      const avatar = document.createElement("div");
      avatar.className = "participant-avatar";
      avatar.textContent = (person.name || "ک").trim().charAt(0) || "ک";

      const details = document.createElement("div");
      details.className = "participant-details";

      const name = document.createElement("strong");
      name.textContent = person.name || "کاربر";

      const label = document.createElement("span");
      label.textContent =
        person.id === socket.id ? "شما" : "عضو اتاق";

      details.append(name, label);
      item.append(avatar, details);

      container.appendChild(item);
    }
  };

  renderList(peopleList);
  renderList(peopleListMirror);

  updateParticipantCounts(participants.length);

  reconcilePeers(participants);
}

async function startMicrophone() {
  if (localStream) return localStream;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "دسترسی به میکروفون در این مرورگر ممکن نیست."
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

  if (micButton) micButton.disabled = false;

  updateMicButton();

  // اگر offer قبل از آماده‌شدن میکروفون رسیده باشد، اکنون پردازش می‌شود.
  await processPendingOffers();

  // ممکن است فهرست کاربران قبل از آماده‌شدن میکروفون رسیده باشد.
  await reconcilePeers(latestParticipants);

  return localStream;
}

function updateMicButton() {
  if (micText) {
    micText.textContent = microphoneEnabled
      ? "خاموش کردن میکروفون"
      : "روشن کردن میکروفون";
  }

  if (micButton) {
    micButton.classList.toggle("muted", !microphoneEnabled);
  }
}

function createPeerConnection(peerId) {
  const existing = peerConnections.get(peerId);

  if (existing && existing.connectionState !== "closed") {
    return existing;
  }

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
      audio.controls = false;
      audio.dataset.peerId = peerId;

      remoteAudios?.appendChild(audio);

      if (!remoteAudios) {
        document.body.appendChild(audio);
      }

      remoteAudioElements.set(peerId, audio);
    }

    if (event.streams?.[0]) {
      audio.srcObject = event.streams[0];
    }

    audio.play().catch((error) => {
      console.warn("پخش صدای دریافتی ناموفق بود:", error);
      setStatus("برای پخش صدا، صفحه را لمس یا روی آن کلیک کن.");
    });
  };

  pc.onconnectionstatechange = () => {
    console.log(
      "[WebRTC]",
      peerId,
      "connection:",
      pc.connectionState,
      "ICE:",
      pc.iceConnectionState
    );

    if (pc.connectionState === "connected") {
      setStatus("اتصال صوتی برقرار است.");
    } else if (pc.connectionState === "failed") {
      setStatus(
        "اتصال صوتی ناموفق بود؛ احتمال نیاز به سرور TURN وجود دارد."
      );
    } else if (pc.connectionState === "disconnected") {
      setStatus("اتصال صوتی ناپایدار یا قطع شده است.");
    }
  };

  pc.onicecandidateerror = (event) => {
    console.warn(
      "[ICE Error]",
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

  const participantIds = new Set(
    participants.map((person) => person.id)
  );

  // اتصال کاربرانی که از اتاق خارج شده‌اند پاک شود.
  for (const peerId of [...peerConnections.keys()]) {
    if (!participantIds.has(peerId)) {
      removePeer(peerId);
    }
  }

  for (const person of participants) {
    if (!person?.id || person.id === socket.id) continue;

    let pc = peerConnections.get(person.id);

    if (!pc || pc.connectionState === "closed") {
      pc = createPeerConnection(person.id);
    }

    // فقط یک سمت اتصال offer می‌سازد تا از برخورد offerها جلوگیری شود.
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
    if (pc.signalingState === "have-local-offer") {
      await pc.setLocalDescription({ type: "rollback" });
    }

    await pc.setRemoteDescription(description);
    await addPendingCandidates(peerId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("webrtc-answer", {
      targetId: peerId,
      description: pc.localDescription
    });
  } catch (error) {
    console.error("پردازش offer ناموفق بود:", error);
    setStatus("ساخت اتصال صوتی ناموفق بود.");
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

  const audio = remoteAudioElements.get(peerId);

  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    remoteAudioElements.delete(peerId);
  }
}

// اتصال به سرور
socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
  setStatus("اتصال به سرور برقرار نشد.");
});

// ورود موفق
socket.on("join-success", async (data) => {
  joined = true;

  showMeeting();

  if (localName) {
    localName.textContent = data?.name || currentName;
  }

  if (roomLabel) {
    roomLabel.textContent = data?.roomLabel || "اتاق گفت‌وگو";
  }

  setStatus("در حال آماده‌سازی میکروفون...");

  try {
    await startMicrophone();
    setStatus("میکروفون آماده است؛ در انتظار اتصال صوتی...");
  } catch (error) {
    console.error("Microphone error:", error);
    setStatus(
      "ورود انجام شد، اما دسترسی به میکروفون برقرار نشد."
    );
    showToast("مجوز میکروفون مرورگر را بررسی کن.");
  }
});

socket.on("join-error", (message) => {
  joined = false;

  const text = typeof message === "string"
    ? message
    : "ورود به اتاق ناموفق بود.";

  setStatus(text);
  showToast(text);

  const submitButton = joinForm?.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = false;
});

socket.on("participants", (participants) => {
  renderParticipants(participants);
});

socket.on("system-message", (data) => {
  const text = typeof data === "string"
    ? data
    : data?.text || "";

  if (text) addMessage(text, "system");
});

socket.on("chat-message", (data) => {
  if (typeof data === "string") {
    addMessage(data, "chat");
    return;
  }

  const text = data?.text || "";
  const name = data?.name || "کاربر";

  if (text) addMessage(text, "chat", name);
});

// دریافت پیشنهاد اتصال
socket.on("webrtc-offer", async (data) => {
  if (!data?.fromId || !data?.description) return;

  await processOffer(data.fromId, data.description);
});

// دریافت پاسخ اتصال
socket.on("webrtc-answer", async (data) => {
  if (!data?.fromId || !data?.description) return;

  const pc = peerConnections.get(data.fromId);

  if (!pc) {
    console.warn("Answer بدون peer connection دریافت شد.");
    return;
  }

  try {
    if (pc.signalingState !== "have-local-offer") {
      console.warn(
        "وضعیت غیرمنتظره هنگام دریافت answer:",
        pc.signalingState
      );
      return;
    }

    await pc.setRemoteDescription(data.description);
    await addPendingCandidates(data.fromId, pc);
  } catch (error) {
    console.error("پردازش answer ناموفق بود:", error);
  }
});

// دریافت ICE candidate
socket.on("webrtc-ice-candidate", async (data) => {
  if (!data?.fromId || !data?.candidate) return;

  const peerId = data.fromId;
  const pc = peerConnections.get(peerId);

  if (!pc || !pc.remoteDescription) {
    if (!pendingCandidates.has(peerId)) {
      pendingCandidates.set(peerId, []);
    }

    pendingCandidates.get(peerId).push(data.candidate);
    return;
  }

  try {
    await pc.addIceCandidate(
      new RTCIceCandidate(data.candidate)
    );
  } catch (error) {
    console.error("افزودن ICE candidate ناموفق بود:", error);
  }
});

// فرم ورود
joinForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (joined) return;

  currentName = usernameInput.value.trim();
  currentRoomCode = roomCodeInput.value.trim().toUpperCase();

  if (!currentName || !currentRoomCode) {
    setStatus("نام و کد اتاق را وارد کن.");
    return;
  }

  const submitButton = joinForm.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  setStatus("در حال بررسی کد ورود...");

  // سرور دقیقاً این دو فیلد را بررسی می‌کند.
  socket.emit("join-room", {
    name: currentName,
    roomCode: currentRoomCode
  });
});

// فرم ارسال پیام
chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!joined || !text) return;

  // سرور فعلی رشته دریافت می‌کند، نه شیء.
  socket.emit("chat-message", text);

  messageInput.value = "";
  messageInput.focus();
});

// روشن و خاموش‌کردن میکروفون
micButton?.addEventListener("click", () => {
  if (!localStream) {
    showToast("میکروفون هنوز آماده نیست.");
    return;
  }

  microphoneEnabled = !microphoneEnabled;

  for (const track of localStream.getAudioTracks()) {
    track.enabled = microphoneEnabled;
  }

  updateMicButton();

  setStatus(
    microphoneEnabled
      ? "میکروفون روشن است."
      : "میکروفون خاموش است."
  );
});

// تب‌های افراد و گفت‌وگو
document.querySelectorAll(".tab[data-panel]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const panelId = tab.dataset.panel;

    document.querySelectorAll(".tab[data-panel]").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });

    document.querySelectorAll(".side-panel .panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== panelId);
    });
  });
});

// خروج از اتاق
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
  latestParticipants = [];

  if (peopleList) peopleList.replaceChildren();
  if (peopleListMirror) peopleListMirror.replaceChildren();

  updateParticipantCounts(0);

  if (messages) {
    messages.replaceChildren();

    const welcome = document.createElement("div");
    welcome.className = "welcome-message";

    const heading = document.createElement("strong");
    heading.textContent = "به گفت‌وگو خوش آمدی";

    const paragraph = document.createElement("p");
    paragraph.textContent =
      "پیام‌ها برای اعضای همین اتاق ارسال می‌شوند.";

    welcome.append(heading, paragraph);
    messages.appendChild(welcome);
  }

  if (micButton) micButton.disabled = true;

  const submitButton = joinForm?.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = false;

  showJoinScreen();
  setStatus("از اتاق خارج شدی.");
}

leaveButton?.addEventListener("click", leaveRoom);
endButton?.addEventListener("click", leaveRoom);

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
