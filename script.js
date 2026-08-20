// =========================================================
// NOVA MEET - FIXED COMPLETE CLIENT
// =========================================================

const socket = io();

const MAX_USERS = 3;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

// =========================================================
// DOM
// =========================================================

const usernameInput =
    document.getElementById("usernameInput");

const joinCallBtn =
    document.getElementById("joinButton");

const leaveCallBtn =
    document.getElementById("leaveButton");

const muteBtn =
    document.getElementById("muteButton");

const cameraBtn =
    document.getElementById("cameraButton");

const screenShareBtn =
    document.getElementById("screenButton");

const videoGrid =
    document.getElementById("videoGrid");

const userCount =
    document.getElementById("userCount");

const serverStatus =
    document.getElementById("serverStatus");

const webrtcStatus =
    document.getElementById("webrtcStatus");

const chatMessages =
    document.getElementById("chatMessages");

const chatInput =
    document.getElementById("chatInput");

const sendButton =
    document.getElementById("sendButton");

const joinPanel =
    document.getElementById("joinPanel");

const mainLayout =
    document.getElementById("mainLayout");

const emptyRoom =
    document.getElementById("emptyRoom");

const bottomJoinButton =
    document.getElementById("bottomJoinButton");

const joinError =
    document.getElementById("joinError");

const nameCounter =
    document.getElementById("nameCounter");

const serverStatusDot =
    document.getElementById("serverStatusDot");

const webrtcStatusDot =
    document.getElementById("webrtcStatusDot");

const roomSummary =
    document.getElementById("roomSummary");

const pingValue =
    document.getElementById("pingValue");

const networkQuality =
    document.getElementById("networkQuality");

// =========================================================
// STATE
// =========================================================

let localStream = null;
let screenStream = null;

let username = "";
let joined = false;

const peers = new Map();
const audioContexts = new Map();

// =========================================================
// STATUS
// =========================================================

function setServerStatus(text, online = false) {

    if (serverStatus) {
        serverStatus.textContent = text;
    }

    if (serverStatusDot) {
        serverStatusDot.classList.toggle(
            "online",
            online
        );

        serverStatusDot.classList.toggle(
            "offline",
            !online
        );
    }
}

function setWebRTCStatus(
    text,
    connected = false
) {

    if (webrtcStatus) {
        webrtcStatus.textContent = text;
    }

    if (webrtcStatusDot) {

        webrtcStatusDot.classList.toggle(
            "online",
            connected
        );

        webrtcStatusDot.classList.toggle(
            "waiting",
            !connected
        );
    }
}

function showError(message) {

    if (joinError) {
        joinError.textContent = message;
    }

    console.error(message);
}

function clearError() {

    if (joinError) {
        joinError.textContent = "";
    }
}

// =========================================================
// JOIN PANEL
// =========================================================

function showMainInterface() {

    if (joinPanel) {
        joinPanel.classList.remove("active");
        joinPanel.classList.add("hidden");
        joinPanel.style.display = "none";
    }

    if (mainLayout) {
        mainLayout.classList.remove("hidden");
        mainLayout.style.display = "";
    }

    if (bottomJoinButton) {
        bottomJoinButton.style.display = "none";
    }
}

function showJoinInterface() {

    if (joinPanel) {
        joinPanel.classList.remove("hidden");
        joinPanel.classList.add("active");
        joinPanel.style.display = "";
    }

    if (mainLayout) {
        mainLayout.style.display = "none";
    }

    if (bottomJoinButton) {
        bottomJoinButton.style.display = "";
    }
}

// =========================================================
// NAME INPUT
// =========================================================

if (usernameInput) {

    usernameInput.addEventListener(
        "input",
        () => {

            if (nameCounter) {
                nameCounter.textContent =
                    `${usernameInput.value.length} / 20`;
            }

            clearError();
        }
    );

    usernameInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                event.preventDefault();

                joinCall();
            }
        }
    );
}

// =========================================================
// VIDEO TILE
// =========================================================

function createVideoTile(
    id,
    name,
    stream,
    type = "camera",
    isLocal = false
) {

    if (!videoGrid || !stream) {
        return null;
    }

    const tileId =
        `${type}-${id}`;

    let tile =
        document.getElementById(tileId);

    if (tile) {

        const video =
            tile.querySelector("video");

        if (
            video &&
            video.srcObject !== stream
        ) {
            video.srcObject = stream;
        }

        return tile;
    }

    tile =
        document.createElement("div");

    tile.className =
        type === "screen"
            ? "video-tile screen-tile"
            : "video-tile";

    tile.id = tileId;

    // VIDEO

    const video =
        document.createElement("video");

    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    video.srcObject = stream;

    // GRADIENT

    const gradient =
        document.createElement("div");

    gradient.className =
        "video-overlay-gradient";

    // TOP

    const topBar =
        document.createElement("div");

    topBar.className =
        "tile-top-bar";

    const badge =
        document.createElement("div");

    badge.className =
        "tile-badge";

    badge.innerHTML =
        type === "screen"
            ? `<i class="fa-solid fa-display"></i> SCREEN`
            : `<i class="fa-solid fa-video"></i> CAMERA`;

    topBar.appendChild(badge);

    // BOTTOM

    const bottomBar =
        document.createElement("div");

    bottomBar.className =
        "tile-bottom-bar";

    const nameLabel =
        document.createElement("div");

    nameLabel.className =
        "name-label";

    const nameSpan =
        document.createElement("span");

    nameSpan.textContent = name;

    nameLabel.appendChild(nameSpan);

    if (isLocal) {

        const youBadge =
            document.createElement("span");

        youBadge.className =
            "you-badge";

        youBadge.textContent =
            "YOU";

        nameLabel.appendChild(
            youBadge
        );
    }

    const actions =
        document.createElement("div");

    actions.className =
        "tile-actions";

    const maximizeBtn =
        document.createElement("button");

    maximizeBtn.type = "button";

    maximizeBtn.className =
        "tile-action";

    maximizeBtn.innerHTML =
        `<i class="fa-solid fa-expand"></i>`;

    maximizeBtn.title =
        "Maximize";

    maximizeBtn.addEventListener(
        "click",
        () => {

            maximizeVideo(
                video,
                type === "screen"
                    ? `${name} • SCREEN`
                    : name
            );
        }
    );

    actions.appendChild(
        maximizeBtn
    );

    bottomBar.appendChild(
        nameLabel
    );

    bottomBar.appendChild(
        actions
    );

    // VOICE

    const voiceIndicator =
        document.createElement("div");

    voiceIndicator.className =
        "voice-indicator";

    for (let i = 0; i < 5; i++) {

        const bar =
            document.createElement("span");

        bar.className =
            "voice-bar";

        voiceIndicator.appendChild(
            bar
        );
    }

    // CAMERA OFF

    const cameraOff =
        document.createElement("div");

    cameraOff.className =
        "camera-off-overlay";

    cameraOff.innerHTML = `
        <i class="fa-solid fa-video-slash"></i>
        <span>Camera is off</span>
    `;

    // APPEND

    tile.appendChild(video);
    tile.appendChild(gradient);
    tile.appendChild(topBar);
    tile.appendChild(bottomBar);
    tile.appendChild(voiceIndicator);
    tile.appendChild(cameraOff);

    videoGrid.appendChild(tile);

    if (emptyRoom) {
        emptyRoom.classList.add("hidden");
    }

    video.play().catch(() => {});

    setupVoiceActivity(
        stream,
        tileId
    );

    return tile;
}

// =========================================================
// REMOVE TILE
// =========================================================

function removeVideoTile(
    id,
    type = "camera"
) {

    const tile =
        document.getElementById(
            `${type}-${id}`
        );

    if (!tile) return;

    cleanupVoiceActivity(
        `${type}-${id}`
    );

    const video =
        tile.querySelector("video");

    if (video) {

        video.pause();

        video.srcObject = null;
    }

    tile.remove();

    if (
        videoGrid &&
        videoGrid.querySelectorAll(
            ".video-tile"
        ).length === 0
    ) {

        if (emptyRoom) {
            emptyRoom.classList.remove(
                "hidden"
            );
        }
    }
}

function removeAllTilesForUser(id) {

    removeVideoTile(id, "camera");
    removeVideoTile(id, "screen");
}

// =========================================================
// MAXIMIZE
// =========================================================

function maximizeVideo(
    video,
    title
) {

    if (!video) return;

    let overlay =
        document.getElementById(
            "videoMaximizeOverlay"
        );

    if (!overlay) {

        overlay =
            document.createElement("div");

        overlay.id =
            "videoMaximizeOverlay";

        overlay.className =
            "video-maximize-overlay";

        const bigVideo =
            document.createElement("video");

        bigVideo.autoplay = true;
        bigVideo.playsInline = true;

        const titleElement =
            document.createElement("div");

        titleElement.className =
            "maximized-video-title";

        const closeBtn =
            document.createElement("button");

        closeBtn.type = "button";

        closeBtn.className =
            "close-maximized-video";

        closeBtn.innerHTML =
            `<i class="fa-solid fa-xmark"></i>`;

        closeBtn.onclick =
            closeMaximizedVideo;

        overlay.appendChild(bigVideo);
        overlay.appendChild(titleElement);
        overlay.appendChild(closeBtn);

        document.body.appendChild(
            overlay
        );
    }

    const bigVideo =
        overlay.querySelector("video");

    const titleElement =
        overlay.querySelector(
            ".maximized-video-title"
        );

    bigVideo.srcObject =
        video.srcObject;

    bigVideo.muted =
        video.muted;

    titleElement.textContent =
        title;

    overlay.classList.add("active");

    bigVideo.play().catch(() => {});
}

function closeMaximizedVideo() {

    const overlay =
        document.getElementById(
            "videoMaximizeOverlay"
        );

    if (!overlay) return;

    const video =
        overlay.querySelector("video");

    if (video) {

        video.pause();

        video.srcObject = null;
    }

    overlay.classList.remove(
        "active"
    );
}

document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {
            closeMaximizedVideo();
        }
    }
);

// =========================================================
// JOIN
// =========================================================

async function joinCall() {

    if (joined) return;

    if (!usernameInput) {
        console.error(
            "usernameInput not found."
        );
        return;
    }

    const name =
        usernameInput.value.trim();

    if (!name) {

        showError(
            "Please enter your name."
        );

        usernameInput.focus();

        return;
    }

    if (name.length > 20) {

        showError(
            "Username must be 20 characters or less."
        );

        return;
    }

    clearError();

    username = name;

    try {

        if (joinCallBtn) {

            joinCallBtn.disabled = true;

            const span =
                joinCallBtn.querySelector(
                    "span"
                );

            if (span) {
                span.textContent =
                    "CONNECTING...";
            }
        }

        setWebRTCStatus(
            "WEBRTC CONNECTING"
        );

        // CAMERA + MICROPHONE

        localStream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

        // LOCAL CAMERA

        createVideoTile(
            socket.id,
            username,
            localStream,
            "camera",
            true
        );

        joined = true;

        // IMPORTANT:
        // Tell server AFTER media is ready.

        socket.emit(
            "join-call",
            {
                username
            }
        );

        // HIDE JOIN PAGE

        showMainInterface();

        // CONTROLS

        if (leaveCallBtn)
            leaveCallBtn.disabled = false;

        if (muteBtn)
            muteBtn.disabled = false;

        if (cameraBtn)
            cameraBtn.disabled = false;

        if (screenShareBtn)
            screenShareBtn.disabled = false;

        if (chatInput) {

            chatInput.disabled = false;

            chatInput.placeholder =
                "Type a message...";
        }

        if (sendButton)
            sendButton.disabled = false;

        // BUTTONS

        if (muteBtn) {

            muteBtn.classList.remove(
                "active-danger"
            );

            muteBtn.innerHTML = `
                <i class="fa-solid fa-microphone"></i>
                <span>MUTE</span>
            `;
        }

        if (cameraBtn) {

            cameraBtn.classList.remove(
                "active-danger"
            );

            cameraBtn.innerHTML = `
                <i class="fa-solid fa-video"></i>
                <span>CAMERA OFF</span>
            `;
        }

        if (screenShareBtn) {

            screenShareBtn.classList.remove(
                "active-share"
            );

            screenShareBtn.innerHTML = `
                <i class="fa-solid fa-display"></i>
                <span>SHARE SCREEN</span>
            `;
        }

        if (roomSummary) {
            roomSummary.textContent =
                `Joined as ${username}`;
        }

        setWebRTCStatus(
            "WEBRTC WAITING"
        );

        addSystemMessage(
            `Welcome ${username}. Camera and microphone connected.`
        );

    } catch (error) {

        console.error(
            "JOIN ERROR:",
            error
        );

        joined = false;

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track => track.stop()
                );
        }

        localStream = null;

        if (joinCallBtn) {

            joinCallBtn.disabled = false;

            const span =
                joinCallBtn.querySelector(
                    "span"
                );

            if (span) {
                span.textContent =
                    "JOIN ROOM";
            }
        }

        setWebRTCStatus(
            "WEBRTC DISCONNECTED"
        );

        if (
            error.name ===
                "NotAllowedError" ||
            error.name ===
                "PermissionDeniedError"
        ) {

            showError(
                "Camera/microphone permission was denied."
            );

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            showError(
                "No camera or microphone was found."
            );

        } else {

            showError(
                "Could not access your camera and microphone."
            );
        }
    }
}

// =========================================================
// CREATE PEER
// =========================================================

function createPeer(
    peerId,
    peerUsername
) {

    if (peers.has(peerId)) {
        return peers.get(peerId);
    }

    const pc =
        new RTCPeerConnection(
            rtcConfig
        );

    const peer = {

        pc,

        username:
            peerUsername || "User",

        pendingCandidates: [],

        makingOffer: false,

        ignoreOffer: false,

        polite:
            String(socket.id) >
            String(peerId),

        remoteStream:
            new MediaStream(),

        screenStream:
            null,

        screenStreamId:
            null,

        screenSender:
            null
    };

    peers.set(
        peerId,
        peer
    );

    // CAMERA + MICROPHONE

    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                pc.addTrack(
                    track,
                    localStream
                );
            });
    }

    // REMOTE TRACK

    pc.addEventListener(
        "track",
        event => {

            handleRemoteTrack(
                peerId,
                peer,
                event
            );
        }
    );

    // ICE

    pc.addEventListener(
        "icecandidate",
        event => {

            if (!event.candidate) return;

            socket.emit(
                "ice-candidate",
                {
                    target: peerId,
                    candidate:
                        event.candidate
                }
            );
        }
    );

    // CONNECTION

    pc.addEventListener(
        "connectionstatechange",
        () => {

            console.log(
                peerId,
                pc.connectionState
            );

            if (
                pc.connectionState ===
                "connected"
            ) {

                setWebRTCStatus(
                    "WEBRTC CONNECTED",
                    true
                );
            }

            if (
                pc.connectionState ===
                "connecting"
            ) {

                setWebRTCStatus(
                    "WEBRTC CONNECTING"
                );
            }
        }
    );

    // NEGOTIATION

    pc.addEventListener(
        "negotiationneeded",
        async () => {

            try {

                await makeOffer(
                    peerId
                );

            } catch (error) {

                console.error(
                    "Negotiation error:",
                    error
                );
            }
        }
    );

    return peer;
}

// =========================================================
// REMOTE TRACK
// =========================================================

function handleRemoteTrack(
    peerId,
    peer,
    event
) {

    const track =
        event.track;

    if (track.kind === "audio") {

        if (
            !peer.remoteStream
                .getAudioTracks()
                .some(
                    t => t.id === track.id
                )
        ) {

            peer.remoteStream.addTrack(
                track
            );
        }

        createVideoTile(
            peerId,
            peer.username,
            peer.remoteStream,
            "camera",
            false
        );

        return;
    }

    if (track.kind !== "video") {
        return;
    }

    // IMPORTANT:
    // The stream ID tells us whether this
    // is the camera stream or screen stream.

    const remoteStream =
        event.streams &&
        event.streams[0];

    if (!remoteStream) {

        console.warn(
            "Remote video has no MediaStream."
        );

        return;
    }

    const streamId =
        remoteStream.id;

    // SCREEN

    if (
        peer.screenStreamId &&
        streamId === peer.screenStreamId
    ) {

        peer.screenStream =
            remoteStream;

        createVideoTile(
            peerId,
            peer.username,
            remoteStream,
            "screen",
            false
        );

        return;
    }

    // CAMERA

    if (
        streamId ===
        peer.remoteStream.id
    ) {

        if (
            !peer.remoteStream
                .getVideoTracks()
                .some(
                    t => t.id === track.id
                )
        ) {

            peer.remoteStream.addTrack(
                track
            );
        }

        createVideoTile(
            peerId,
            peer.username,
            peer.remoteStream,
            "camera",
            false
        );

        return;
    }

    // FALLBACK:
    // If server's screen event has not arrived yet,
    // use the known screen state.

    if (
        peer.receivingScreen &&
        !peer.screenStreamId
    ) {

        peer.screenStream =
            remoteStream;

        peer.screenStreamId =
            streamId;

        createVideoTile(
            peerId,
            peer.username,
            remoteStream,
            "screen",
            false
        );

        return;
    }

    // Normal camera

    if (
        !peer.remoteStream
            .getVideoTracks()
            .some(
                t => t.id === track.id
            )
    ) {

        peer.remoteStream.addTrack(
            track
        );
    }

    createVideoTile(
        peerId,
        peer.username,
        peer.remoteStream,
        "camera",
        false
    );
}

// =========================================================
// OFFER
// =========================================================

async function makeOffer(
    peerId
) {

    const peer =
        peers.get(peerId);

    if (!peer) return;

    const pc =
        peer.pc;

    if (
        pc.signalingState !==
        "stable"
    ) {
        return;
    }

    try {

        peer.makingOffer = true;

        await pc.setLocalDescription();

        socket.emit(
            "offer",
            {
                target: peerId,
                offer:
                    pc.localDescription
            }
        );

    } catch (error) {

        console.error(
            "Offer error:",
            error
        );

    } finally {

        peer.makingOffer = false;
    }
}

// =========================================================
// ICE QUEUE
// =========================================================

async function flushPendingCandidates(
    peer
) {

    if (
        !peer.pc.remoteDescription
    ) {
        return;
    }

    while (
        peer.pendingCandidates.length
    ) {

        const candidate =
            peer.pendingCandidates.shift();

        try {

            await peer.pc.addIceCandidate(
                candidate
            );

        } catch (error) {

            console.warn(
                "ICE error:",
                error
            );
        }
    }
}

// =========================================================
// EXISTING USERS
// =========================================================

socket.on(
    "existing-users",
    users => {

        users.forEach(user => {

            const peer =
                createPeer(
                    user.id,
                    user.username
                );

            peer.cameraOn =
                user.cameraOn !== false;

            peer.microphoneOn =
                user.microphoneOn !== false;

            if (user.screenSharing) {
                peer.receivingScreen = true;
            }
        });
    }
);

// =========================================================
// NEW USER
// =========================================================

socket.on(
    "user-joined",
    ({
        id,
        username: newUsername
    }) => {

        createPeer(
            id,
            newUsername
        );

        addSystemMessage(
            `${newUsername} joined the room.`
        );
    }
);

// =========================================================
// OFFER
// =========================================================

socket.on(
    "offer",
    async ({
        from,
        offer
    }) => {

        if (!joined) return;

        let peer =
            peers.get(from);

        if (!peer) {

            peer =
                createPeer(
                    from,
                    "User"
                );
        }

        const pc =
            peer.pc;

        try {

            const offerCollision =
                peer.makingOffer ||
                pc.signalingState !==
                "stable";

            peer.ignoreOffer =
                !peer.polite &&
                offerCollision;

            if (peer.ignoreOffer) {
                return;
            }

            if (offerCollision) {

                await Promise.all([
                    pc.setLocalDescription({
                        type:
                            "rollback"
                    }),
                    pc.setRemoteDescription(
                        offer
                    )
                ]);

            } else {

                await pc.setRemoteDescription(
                    offer
                );
            }

            await flushPendingCandidates(
                peer
            );

            await pc.setLocalDescription();

            socket.emit(
                "answer",
                {
                    target: from,
                    answer:
                        pc.localDescription
                }
            );

        } catch (error) {

            console.error(
                "Offer handling error:",
                error
            );
        }
    }
);

// =========================================================
// ANSWER
// =========================================================

socket.on(
    "answer",
    async ({
        from,
        answer
    }) => {

        const peer =
            peers.get(from);

        if (!peer) return;

        try {

            await peer.pc.setRemoteDescription(
                answer
            );

            await flushPendingCandidates(
                peer
            );

        } catch (error) {

            console.error(
                "Answer error:",
                error
            );
        }
    }
);

// =========================================================
// ICE
// =========================================================

socket.on(
    "ice-candidate",
    async ({
        from,
        candidate
    }) => {

        const peer =
            peers.get(from);

        if (!peer) return;

        try {

            if (
                peer.pc.remoteDescription
            ) {

                await peer.pc.addIceCandidate(
                    candidate
                );

            } else {

                peer.pendingCandidates.push(
                    candidate
                );
            }

        } catch (error) {

            if (!peer.ignoreOffer) {

                console.error(
                    "ICE candidate error:",
                    error
                );
            }
        }
    }
);

// =========================================================
// MUTE
// =========================================================

function toggleMute() {

    if (!localStream) return;

    const tracks =
        localStream.getAudioTracks();

    if (!tracks.length) return;

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(
        track => {
            track.enabled =
                enabled;
        }
    );

    if (muteBtn) {

        muteBtn.classList.toggle(
            "active-danger",
            !enabled
        );

        muteBtn.innerHTML =
            enabled
                ? `
                    <i class="fa-solid fa-microphone"></i>
                    <span>MUTE</span>
                  `
                : `
                    <i class="fa-solid fa-microphone-slash"></i>
                    <span>UNMUTE</span>
                  `;
    }

    socket.emit(
        "microphone-state",
        {
            enabled
        }
    );
}

// =========================================================
// CAMERA
// =========================================================

function toggleCamera() {

    if (!localStream) return;

    const tracks =
        localStream.getVideoTracks();

    if (!tracks.length) return;

    const enabled =
        !tracks[0].enabled;

    tracks.forEach(
        track => {
            track.enabled =
                enabled;
        }
    );

    const tile =
        document.getElementById(
            `camera-${socket.id}`
        );

    const overlay =
        tile?.querySelector(
            ".camera-off-overlay"
        );

    overlay?.classList.toggle(
        "active",
        !enabled
    );

    if (cameraBtn) {

        cameraBtn.classList.toggle(
            "active-danger",
            !enabled
        );

        cameraBtn.innerHTML =
            enabled
                ? `
                    <i class="fa-solid fa-video"></i>
                    <span>CAMERA OFF</span>
                  `
                : `
                    <i class="fa-solid fa-video-slash"></i>
                    <span>CAMERA ON</span>
                  `;
    }

    socket.emit(
        "camera-state",
        {
            enabled
        }
    );
}

// =========================================================
// REMOTE CAMERA STATE
// =========================================================

socket.on(
    "camera-state",
    ({
        id,
        enabled
    }) => {

        const tile =
            document.getElementById(
                `camera-${id}`
            );

        if (!tile) return;

        const overlay =
            tile.querySelector(
                ".camera-off-overlay"
            );

        if (overlay) {

            overlay.classList.toggle(
                "active",
                !enabled
            );
        }
    }
);

// =========================================================
// REMOTE MICROPHONE STATE
// =========================================================

socket.on(
    "microphone-state",
    ({
        id,
        enabled
    }) => {

        const tile =
            document.getElementById(
                `camera-${id}`
            );

        if (!tile) return;

        tile.classList.toggle(
            "mic-off",
            !enabled
        );
    }
);

// =========================================================
// SCREEN SHARE
// =========================================================

async function toggleScreenShare() {

    if (!joined) return;

    if (screenStream) {

        await stopScreenShare();

        return;
    }

    try {

        const stream =
            await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

        const track =
            stream.getVideoTracks()[0];

        if (!track) return;

        screenStream =
            stream;

        // SHOW TO SHARE USER

        createVideoTile(
            socket.id,
            username,
            screenStream,
            "screen",
            true
        );

        // ADD SCREEN TRACK

        for (
            const [peerId, peer]
            of peers
        ) {

            const sender =
                peer.pc.addTrack(
                    track,
                    screenStream
                );

            peer.screenSender =
                sender;
        }

        // TELL OTHERS WHICH STREAM IS SCREEN

        socket.emit(
            "screen-start",
            {
                username,
                streamId:
                    screenStream.id
            }
        );

        track.addEventListener(
            "ended",
            () => {

                if (screenStream) {
                    stopScreenShare();
                }
            },
            {
                once: true
            }
        );

        if (screenShareBtn) {

            screenShareBtn.classList.add(
                "active-share"
            );

            screenShareBtn.innerHTML = `
                <i class="fa-solid fa-stop"></i>
                <span>STOP SHARE</span>
            `;
        }

        addSystemMessage(
            "Screen sharing started."
        );

    } catch (error) {

        console.error(
            "Screen share error:",
            error
        );
    }
}

// =========================================================
// REMOTE SCREEN START
// =========================================================

socket.on(
    "screen-start",
    ({
        id,
        username: screenUsername,
        streamId
    }) => {

        const peer =
            peers.get(id);

        if (!peer) return;

        peer.receivingScreen =
            true;

        peer.screenStreamId =
            streamId || null;

        addSystemMessage(
            `${screenUsername || peer.username} started screen sharing.`
        );
    }
);

// =========================================================
// REMOTE SCREEN STOP
// =========================================================

socket.on(
    "screen-stop",
    ({ id }) => {

        const peer =
            peers.get(id);

        if (!peer) return;

        peer.receivingScreen =
            false;

        peer.screenStreamId =
            null;

        peer.screenStream =
            null;

        removeVideoTile(
            id,
            "screen"
        );
    }
);

// =========================================================
// STOP SCREEN
// =========================================================

async function stopScreenShare() {

    if (!screenStream) return;

    const oldStream =
        screenStream;

    screenStream = null;

    removeVideoTile(
        socket.id,
        "screen"
    );

    for (
        const [peerId, peer]
        of peers
    ) {

        if (!peer.screenSender) {
            continue;
        }

        try {

            peer.pc.removeTrack(
                peer.screenSender
            );

        } catch (error) {

            console.warn(
                error
            );
        }

        peer.screenSender =
            null;
    }

    oldStream
        .getTracks()
        .forEach(
            track => track.stop()
        );

    socket.emit(
        "screen-stop"
    );

    if (screenShareBtn) {

        screenShareBtn.classList.remove(
            "active-share"
        );

        screenShareBtn.innerHTML = `
            <i class="fa-solid fa-display"></i>
            <span>SHARE SCREEN</span>
        `;
    }

    addSystemMessage(
        "Screen sharing stopped."
    );
}

// =========================================================
// CHAT
// =========================================================

function sendMessage() {

    if (!chatInput) return;

    const message =
        chatInput.value.trim();

    if (!message || !joined) return;

    socket.emit(
        "chat-message",
        {
            message
        }
    );

    chatInput.value = "";
}

function addChatMessage({
    username: sender,
    message,
    time
}) {

    if (!chatMessages) return;

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "chat-message";

    const meta =
        document.createElement("div");

    meta.className =
        "message-meta";

    const senderElement =
        document.createElement("span");

    senderElement.className =
        "message-sender";

    senderElement.textContent =
        sender;

    const timeElement =
        document.createElement("span");

    timeElement.className =
        "message-time";

    timeElement.textContent =
        new Date(time)
            .toLocaleTimeString(
                [],
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );

    meta.appendChild(
        senderElement
    );

    meta.appendChild(
        timeElement
    );

    const bubble =
        document.createElement("div");

    bubble.className =
        "message-bubble";

    bubble.textContent =
        message;

    wrapper.appendChild(
        meta
    );

    wrapper.appendChild(
        bubble
    );

    chatMessages.appendChild(
        wrapper
    );

    chatMessages.scrollTop =
        chatMessages.scrollHeight;
}

function addSystemMessage(text) {

    if (!chatMessages) return;

    const message =
        document.createElement("div");

    message.className =
        "chat-system-message";

    message.innerHTML = `
        <i class="fa-solid fa-circle-info"></i>
        <span></span>
    `;

    message.querySelector(
        "span"
    ).textContent =
        text;

    chatMessages.appendChild(
        message
    );

    chatMessages.scrollTop =
        chatMessages.scrollHeight;
}

socket.on(
    "chat-message",
    addChatMessage
);

socket.on(
    "system-message",
    ({ text }) => {

        addSystemMessage(text);
    }
);

// =========================================================
// USER LEFT
// =========================================================

socket.on(
    "user-left",
    ({
        id,
        username: leftUsername
    }) => {

        cleanupPeer(id);

        removeAllTilesForUser(id);

        addSystemMessage(
            `${leftUsername} left the room.`
        );

        if (
            peers.size === 0 &&
            joined
        ) {

            setWebRTCStatus(
                "WEBRTC WAITING"
            );
        }
    }
);

// =========================================================
// JOIN ERROR
// =========================================================

socket.on(
    "join-error",
    ({ message }) => {

        joined = false;

        showError(message);

        if (joinCallBtn) {

            joinCallBtn.disabled = false;

            const span =
                joinCallBtn.querySelector(
                    "span"
                );

            if (span) {
                span.textContent =
                    "JOIN ROOM";
            }
        }
    }
);

// =========================================================
// ROOM FULL
// =========================================================

socket.on(
    "room-full",
    () => {

        joined = false;

        showError(
            "Room is full. Maximum 3 users."
        );

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track => track.stop()
                );

            localStream = null;
        }

        showJoinInterface();

        if (joinCallBtn) {
            joinCallBtn.disabled = false;

            const span =
                joinCallBtn.querySelector(
                    "span"
                );

            if (span) {
                span.textContent =
                    "JOIN ROOM";
            }
        }
    }
);

// =========================================================
// USER COUNT
// =========================================================

socket.on(
    "user-count",
    ({
        count,
        max
    }) => {

        if (userCount) {

            userCount.textContent =
                `${count} / ${max} USERS`;
        }
    }
);

// =========================================================
// CLEANUP PEER
// =========================================================

function cleanupPeer(
    peerId
) {

    const peer =
        peers.get(peerId);

    if (!peer) return;

    cleanupVoiceActivity(
        `camera-${peerId}`
    );

    cleanupVoiceActivity(
        `screen-${peerId}`
    );

    if (peer.pc) {
        peer.pc.close();
    }

    peers.delete(peerId);
}

// =========================================================
// LEAVE
// =========================================================

async function leaveCall() {

    if (!joined) {
        showJoinInterface();
        return;
    }

    socket.emit(
        "leave-call"
    );

    if (screenStream) {
        await stopScreenShare();
    }

    peers.forEach(
        (_, peerId) => {
            cleanupPeer(peerId);
        }
    );

    peers.clear();

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => track.stop()
            );

        localStream = null;
    }

    removeAllTilesForUser(
        socket.id
    );

    joined = false;

    if (leaveCallBtn)
        leaveCallBtn.disabled = true;

    if (muteBtn) {

        muteBtn.disabled = true;

        muteBtn.classList.remove(
            "active-danger"
        );
    }

    if (cameraBtn) {

        cameraBtn.disabled = true;

        cameraBtn.classList.remove(
            "active-danger"
        );
    }

    if (screenShareBtn) {

        screenShareBtn.disabled = true;

        screenShareBtn.classList.remove(
            "active-share"
        );
    }

    if (chatInput) {

        chatInput.disabled = true;

        chatInput.value = "";

        chatInput.placeholder =
            "Join the room to chat...";
    }

    if (sendButton) {
        sendButton.disabled = true;
    }

    if (roomSummary) {
        roomSummary.textContent =
            "Waiting to join";
    }

    setWebRTCStatus(
        "WEBRTC DISCONNECTED"
    );

    showJoinInterface();

    if (joinCallBtn) {

        joinCallBtn.disabled = false;

        const span =
            joinCallBtn.querySelector(
                "span"
            );

        if (span) {
            span.textContent =
                "JOIN ROOM";
        }
    }
}

// =========================================================
// NETWORK
// =========================================================

async function updateNetworkQuality() {

    if (
        !joined ||
        peers.size === 0
    ) {
        return;
    }

    let bestPing = null;

    for (
        const peer
        of peers.values()
    ) {

        try {

            const stats =
                await peer.pc.getStats();

            stats.forEach(
                report => {

                    if (
                        report.type ===
                            "candidate-pair" &&
                        report.state ===
                            "succeeded" &&
                        report.currentRoundTripTime !==
                            undefined
                    ) {

                        const ping =
                            Math.round(
                                report.currentRoundTripTime *
                                1000
                            );

                        if (
                            bestPing === null ||
                            ping < bestPing
                        ) {
                            bestPing = ping;
                        }
                    }
                }
            );

        } catch {}
    }

    if (bestPing === null) return;

    if (pingValue) {

        pingValue.textContent =
            `PING ${bestPing} ms`;
    }

    if (networkQuality) {

        if (bestPing < 100) {

            networkQuality.textContent =
                "EXCELLENT";

        } else if (bestPing < 200) {

            networkQuality.textContent =
                "GOOD";

        } else {

            networkQuality.textContent =
                "POOR";
        }
    }
}

setInterval(
    updateNetworkQuality,
    2000
);

// =========================================================
// VOICE ACTIVITY
// =========================================================

function setupVoiceActivity(
    stream,
    tileId
) {

    if (!stream) return;

    if (
        audioContexts.has(tileId)
    ) {
        return;
    }

    if (
        stream.getAudioTracks()
            .length === 0
    ) {
        return;
    }

    try {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) return;

        const audioContext =
            new AudioContextClass();

        const source =
            audioContext
                .createMediaStreamSource(
                    stream
                );

        const analyser =
            audioContext
                .createAnalyser();

        analyser.fftSize =
            256;

        analyser.smoothingTimeConstant =
            0.75;

        source.connect(
            analyser
        );

        const data =
            new Uint8Array(
                analyser.frequencyBinCount
            );

        audioContexts.set(
            tileId,
            {
                audioContext,
                source,
                analyser
            }
        );

        function animate() {

            if (
                !audioContexts.has(
                    tileId
                )
            ) {
                return;
            }

            analyser.getByteFrequencyData(
                data
            );

            let total = 0;

            for (
                let i = 0;
                i < data.length;
                i++
            ) {

                total += data[i];
            }

            const average =
                total / data.length;

            const tile =
                document.getElementById(
                    tileId
                );

            if (tile) {

                const bars =
                    tile.querySelectorAll(
                        ".voice-bar"
                    );

                const speaking =
                    average > 10;

                tile.classList.toggle(
                    "speaking",
                    speaking
                );

                bars.forEach(
                    (bar, index) => {

                        if (!speaking) {

                            bar.style.height =
                                "3px";

                            return;
                        }

                        const multiplier =
                            0.45 +
                            index * 0.15;

                        const value =
                            Math.max(
                                4,
                                Math.min(
                                    24,
                                    average *
                                    multiplier
                                )
                            );

                        bar.style.height =
                            `${value}px`;
                    }
                );
            }

            requestAnimationFrame(
                animate
            );
        }

        animate();

    } catch (error) {

        console.warn(
            "Voice activity:",
            error
        );
    }
}

function cleanupVoiceActivity(
    tileId
) {

    const item =
        audioContexts.get(
            tileId
        );

    if (!item) return;

    try {
        item.source.disconnect();
    } catch {}

    try {
        item.analyser.disconnect();
    } catch {}

    try {
        item.audioContext.close();
    } catch {}

    audioContexts.delete(
        tileId
    );
}

// =========================================================
// BUTTON EVENTS
// =========================================================

if (joinCallBtn) {

    joinCallBtn.addEventListener(
        "click",
        joinCall
    );
}

if (bottomJoinButton) {

    bottomJoinButton.addEventListener(
        "click",
        () => {

            if (!joined && usernameInput) {
                usernameInput.focus();
            }
        }
    );
}

if (leaveCallBtn) {

    leaveCallBtn.addEventListener(
        "click",
        leaveCall
    );
}

if (muteBtn) {

    muteBtn.addEventListener(
        "click",
        toggleMute
    );
}

if (cameraBtn) {

    cameraBtn.addEventListener(
        "click",
        toggleCamera
    );
}

if (screenShareBtn) {

    screenShareBtn.addEventListener(
        "click",
        toggleScreenShare
    );
}

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );
}

if (chatInput) {

    chatInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();
            }
        }
    );
}

// =========================================================
// SOCKET STATUS
// =========================================================

socket.on(
    "connect",
    () => {

        setServerStatus(
            "SERVER ONLINE",
            true
        );
    }
);

socket.on(
    "disconnect",
    () => {

        setServerStatus(
            "SERVER OFFLINE",
            false
        );

        if (joined) {

            setWebRTCStatus(
                "SERVER DISCONNECTED"
            );
        }
    }
);

// =========================================================
// INITIAL
// =========================================================

setServerStatus(
    socket.connected
        ? "SERVER ONLINE"
        : "SERVER OFFLINE",
    socket.connected
);

setWebRTCStatus(
    "WEBRTC DISCONNECTED",
    false
);

if (leaveCallBtn)
    leaveCallBtn.disabled = true;

if (muteBtn)
    muteBtn.disabled = true;

if (cameraBtn)
    cameraBtn.disabled = true;

if (screenShareBtn)
    screenShareBtn.disabled = true;

if (chatInput)
    chatInput.disabled = true;

if (sendButton)
    sendButton.disabled = true;