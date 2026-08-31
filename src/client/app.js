const state = {
  socket: null,
  self: null,
  rooms: [],
  room: null,
  peers: new Map(),
  localTracks: new Map(),
  reconnectTimer: null,
  manualLeave: false,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  banner: $("#connection-banner"),
  lobby: $("#lobby"),
  meeting: $("#meeting-layout"),
  meetingHeading: $("#meeting-heading"),
  roomTitle: $("#room-title"),
  meetingMeta: $("#meeting-meta"),
  displayName: $("#display-name"),
  roomList: $("#room-list"),
  createDialog: $("#create-dialog"),
  createForm: $("#create-form"),
  projectName: $("#project-name"),
  collaborationName: $("#collaboration-name"),
  mediaGrid: $("#media-grid"),
  stageEmpty: $("#stage-empty"),
  memberList: $("#member-list"),
  memberCount: $("#member-count"),
  activeTopic: $("#active-topic"),
  agentStatus: $("#agent-status"),
  agentAction: $("#agent-action"),
  contextFeed: $("#context-feed"),
  contextForm: $("#context-form"),
  contextInput: $("#context-input"),
  toastRegion: $("#toast-region"),
  leaveRoom: $("#leave-room"),
  audio: $("#toggle-audio"),
  camera: $("#toggle-camera"),
  screen: $("#toggle-screen"),
  mediaAccessNotice: $("#media-access-notice"),
  mediaAccessMessage: $("#media-access-message"),
  mediaAccessLink: $("#media-access-link"),
};

function mediaAccessIssue(method, feature) {
  if (navigator.mediaDevices && typeof navigator.mediaDevices[method] === "function") return null;
  if (!window.isSecureContext) {
    return `${feature}需要安全连接。本机请使用 localhost；其他局域网设备需通过 HTTPS 打开。`;
  }
  if (!navigator.mediaDevices) return `当前浏览器不支持${feature}所需的媒体接口。`;
  return `当前浏览器不支持${feature}。`;
}

function mediaMethod(method, feature) {
  const issue = mediaAccessIssue(method, feature);
  if (issue) {
    toast(issue, true);
    return null;
  }
  return navigator.mediaDevices[method].bind(navigator.mediaDevices);
}

function updateMediaAccessNotice() {
  const issue = mediaAccessIssue("getUserMedia", "摄像头和麦克风");
  if (!issue) {
    elements.mediaAccessNotice.hidden = true;
    return;
  }

  elements.mediaAccessMessage.textContent = issue;
  const loopbackUrl = new URL(location.href);
  loopbackUrl.hostname = "localhost";
  elements.mediaAccessLink.href = loopbackUrl.href;
  elements.mediaAccessLink.hidden = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  elements.mediaAccessNotice.hidden = false;
}

function send(type, payload = {}) {
  if (state.socket?.readyState !== WebSocket.OPEN) {
    toast("协作服务尚未连接", true);
    return false;
  }
  state.socket.send(JSON.stringify({ type, ...payload }));
  return true;
}

function toast(message, isError = false) {
  const item = document.createElement("div");
  item.className = `toast${isError ? " is-error" : ""}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

function connect() {
  window.clearTimeout(state.reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  state.socket = socket;
  elements.banner.textContent = "正在连接本地协作服务";
  elements.banner.className = "connection-banner";

  socket.addEventListener("open", () => {
    elements.banner.classList.add("is-ready");
  });

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    await handleMessage(message);
  });

  socket.addEventListener("close", () => {
    elements.banner.textContent = "连接已断开，正在重试";
    elements.banner.className = "connection-banner is-error";
    closeAllPeers();
    if (!state.manualLeave) state.reconnectTimer = window.setTimeout(connect, 1200);
  });

  socket.addEventListener("error", () => {
    elements.banner.textContent = "无法连接协作服务";
    elements.banner.className = "connection-banner is-error";
  });
}

async function handleMessage(message) {
  switch (message.type) {
    case "session:ready":
      state.self = message.self;
      state.rooms = message.rooms;
      renderRooms();
      break;
    case "rooms:snapshot":
      state.rooms = message.rooms;
      renderRooms();
      break;
    case "room:state":
      state.room = message.room;
      showMeeting();
      reconcilePeers();
      renderRoom();
      break;
    case "room:left":
      state.room = null;
      closeAllPeers();
      stopAllLocalMedia();
      showLobby();
      break;
    case "signal":
      await handleSignal(message.fromId, message.payload);
      break;
    case "error":
      toast(message.message, true);
      break;
    default:
      break;
  }
}

function renderRooms() {
  elements.roomList.replaceChildren();
  if (!state.rooms.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    const wrapper = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "附近还没有协作";
    const copy = document.createElement("span");
    copy.textContent = "创建第一个房间，其他成员打开同一地址即可加入。";
    wrapper.append(title, copy);
    empty.append(wrapper);
    elements.roomList.append(empty);
    return;
  }

  for (const room of state.rooms) {
    const item = document.createElement("article");
    item.className = "room-item";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = room.name;
    const meta = document.createElement("span");
    meta.textContent = `${room.project}，${room.participantCount} 人在线`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-ghost";
    button.textContent = "加入";
    button.addEventListener("click", () => joinRoom(room.id));
    info.append(title, meta);
    item.append(info, button);
    elements.roomList.append(item);
  }
}

function showMeeting() {
  elements.lobby.hidden = true;
  elements.meeting.hidden = false;
  elements.meetingHeading.hidden = false;
  elements.leaveRoom.hidden = false;
}

function showLobby() {
  elements.lobby.hidden = false;
  elements.meeting.hidden = true;
  elements.meetingHeading.hidden = true;
  elements.leaveRoom.hidden = true;
  send("rooms:list");
}

function renderRoom() {
  if (!state.room) return;
  const self = state.room.participants.find((participant) => participant.id === state.self?.id);
  if (self) state.self = self;
  elements.roomTitle.textContent = state.room.name;
  elements.meetingMeta.textContent = `${state.room.project}，${state.room.participants.length} 人在线`;
  elements.memberCount.textContent = `${state.room.participants.length} 人`;
  elements.activeTopic.textContent = state.room.activeTopic;

  const statusCopy = {
    idle: "等待任务",
    working: "正在读取讨论并组织任务",
    done: "任务已生成，可继续交给 Harness 执行",
  };
  elements.agentStatus.textContent = statusCopy[state.room.agent.status] ?? "等待任务";
  elements.agentAction.disabled = state.room.agent.status === "working";
  elements.agentAction.textContent = state.room.agent.status === "working" ? "Agent 正在处理" : "根据讨论生成任务";

  renderMembers();
  renderContext();
  syncControlState();
  updateMediaLabels();
}

function renderMembers() {
  elements.memberList.replaceChildren();
  for (const participant of state.room.participants) {
    const row = document.createElement("div");
    row.className = "member";
    const avatar = document.createElement("div");
    avatar.className = "member-avatar";
    avatar.textContent = participant.name.slice(0, 1).toUpperCase();
    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = participant.id === state.self.id ? `${participant.name}（你）` : participant.name;
    const role = document.createElement("small");
    role.textContent = participant.id === state.room.hostId ? "房主" : "成员";
    identity.append(name, role);

    const media = document.createElement("div");
    media.className = "media-state";
    for (const [key, label] of [["audio", "麦"], ["camera", "像"], ["screen", "屏"]]) {
      const chip = document.createElement("span");
      chip.className = `media-chip${participant.media[key] ? " is-on" : ""}`;
      chip.textContent = label;
      media.append(chip);
    }
    row.append(avatar, identity, media);
    elements.memberList.append(row);
  }
}

function renderContext() {
  elements.contextFeed.replaceChildren();
  const events = state.room.context.filter((item) => item.kind !== "system");
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "讨论开始后，上下文会出现在这里。";
    elements.contextFeed.append(empty);
    return;
  }

  for (const event of events.slice().reverse()) {
    const item = document.createElement("article");
    item.className = "context-item";
    item.dataset.kind = event.kind;
    const meta = document.createElement("div");
    meta.className = "context-meta";
    const author = document.createElement("strong");
    author.textContent = event.author;
    const time = document.createElement("time");
    time.dateTime = event.at;
    time.textContent = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.at));
    const copy = document.createElement("p");
    copy.textContent = event.text;
    meta.append(author, time);
    item.append(meta, copy);
    elements.contextFeed.append(item);
  }
}

function currentName() {
  const name = elements.displayName.value.trim();
  if (!name) {
    elements.displayName.focus();
    toast("请先填写姓名", true);
    return null;
  }
  localStorage.setItem("dsh-meeting-name", name);
  return name;
}

function joinRoom(roomId) {
  const name = currentName();
  if (!name) return;
  send("room:join", { roomId, name });
}

function createRoom() {
  const name = currentName();
  if (!name) return;
  const roomName = elements.collaborationName.value.trim();
  const project = elements.projectName.value.trim();
  if (!roomName || !project) {
    toast("请填写项目与协作名称", true);
    return;
  }
  send("room:create", { name, roomName, project });
  elements.createDialog.close();
}

function reconcilePeers() {
  if (!state.room || !state.self) return;
  const memberIds = new Set(state.room.participants.map((participant) => participant.id));
  memberIds.delete(state.self.id);

  for (const peerId of memberIds) ensurePeer(peerId);
  for (const peerId of state.peers.keys()) {
    if (!memberIds.has(peerId)) closePeer(peerId);
  }
}

function ensurePeer(peerId) {
  if (state.peers.has(peerId)) return state.peers.get(peerId);
  const pc = new RTCPeerConnection({ iceServers: [] });
  const peer = {
    pc,
    polite: state.self.id.localeCompare(peerId) > 0,
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    stream: new MediaStream(),
  };
  state.peers.set(peerId, peer);

  for (const { track, stream } of state.localTracks.values()) pc.addTrack(track, stream);

  pc.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) send("signal", { targetId: peerId, payload: { candidate } });
  });

  pc.addEventListener("negotiationneeded", async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      send("signal", { targetId: peerId, payload: { description: pc.localDescription } });
    } catch (error) {
      toast(`媒体协商失败：${error.message}`, true);
    } finally {
      peer.makingOffer = false;
    }
  });

  pc.addEventListener("track", ({ track }) => {
    if (!peer.stream.getTracks().some((current) => current.id === track.id)) peer.stream.addTrack(track);
    createOrUpdateMediaTile(`peer-${peerId}`, peer.stream, participantName(peerId), false);
    track.addEventListener("ended", () => {
      peer.stream.removeTrack(track);
      if (!peer.stream.getTracks().length) removeMediaTile(`peer-${peerId}`);
    });
  });

  pc.addEventListener("connectionstatechange", () => {
    if (["failed", "closed"].includes(pc.connectionState)) closePeer(peerId);
  });

  return peer;
}

async function handleSignal(peerId, payload) {
  const peer = ensurePeer(peerId);
  const { pc } = peer;

  try {
    if (payload.description) {
      const description = payload.description;
      const readyForOffer = !peer.makingOffer && (pc.signalingState === "stable" || peer.isSettingRemoteAnswerPending);
      const offerCollision = description.type === "offer" && !readyForOffer;
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      peer.isSettingRemoteAnswerPending = description.type === "answer";
      await pc.setRemoteDescription(description);
      peer.isSettingRemoteAnswerPending = false;
      if (description.type === "offer") {
        await pc.setLocalDescription();
        send("signal", { targetId: peerId, payload: { description: pc.localDescription } });
      }
    } else if (payload.candidate) {
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch (error) {
        if (!peer.ignoreOffer) throw error;
      }
    }
  } catch (error) {
    toast(`无法连接 ${participantName(peerId)}：${error.message}`, true);
  }
}

function participantName(peerId) {
  return state.room?.participants.find((participant) => participant.id === peerId)?.name ?? "协作成员";
}

async function toggleAudio() {
  const current = state.localTracks.get("audio");
  if (current) {
    current.track.enabled = !current.track.enabled;
  } else {
    try {
      const getUserMedia = mediaMethod("getUserMedia", "麦克风");
      if (!getUserMedia) return;
      const stream = await getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      state.localTracks.set("audio", { track, stream });
      addTrackToPeers(track, stream);
    } catch (error) {
      toast(`无法使用麦克风：${error?.message || "浏览器拒绝了请求"}`, true);
      return;
    }
  }
  publishMediaState();
}

async function toggleCamera() {
  if (state.localTracks.has("camera")) {
    removeLocalTrack("camera");
    removeMediaTile("local-camera");
  } else {
    try {
      const getUserMedia = mediaMethod("getUserMedia", "摄像头");
      if (!getUserMedia) return;
      const stream = await getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      state.localTracks.set("camera", { track, stream });
      addTrackToPeers(track, stream);
      createOrUpdateMediaTile("local-camera", stream, "你的摄像头", true);
    } catch (error) {
      toast(`无法使用摄像头：${error?.message || "浏览器拒绝了请求"}`, true);
      return;
    }
  }
  publishMediaState();
}

async function toggleScreen() {
  if (state.localTracks.has("screen")) {
    stopScreen();
    return;
  }
  try {
    const getDisplayMedia = mediaMethod("getDisplayMedia", "屏幕共享");
    if (!getDisplayMedia) return;
    const stream = await getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    state.localTracks.set("screen", { track, stream });
    addTrackToPeers(track, stream);
    createOrUpdateMediaTile("local-screen", stream, "你正在共享", true);
    track.addEventListener("ended", stopScreen, { once: true });
    publishMediaState();
  } catch (error) {
    if (error?.name !== "NotAllowedError") toast(`无法共享屏幕：${error?.message || "浏览器拒绝了请求"}`, true);
  }
}

function stopScreen() {
  removeLocalTrack("screen");
  removeMediaTile("local-screen");
  publishMediaState();
}

function addTrackToPeers(track, stream) {
  for (const { pc } of state.peers.values()) pc.addTrack(track, stream);
}

function removeLocalTrack(key) {
  const current = state.localTracks.get(key);
  if (!current) return;
  for (const { pc } of state.peers.values()) {
    const sender = pc.getSenders().find((item) => item.track === current.track);
    if (sender) pc.removeTrack(sender);
  }
  current.track.stop();
  for (const track of current.stream.getTracks()) track.stop();
  state.localTracks.delete(key);
}

function stopAllLocalMedia() {
  for (const key of [...state.localTracks.keys()]) removeLocalTrack(key);
  document.querySelectorAll(".media-tile").forEach((tile) => tile.remove());
  elements.stageEmpty.hidden = false;
  syncControlState();
}

function publishMediaState() {
  const audio = state.localTracks.get("audio")?.track.enabled ?? false;
  send("media:update", {
    media: {
      audio,
      camera: state.localTracks.has("camera"),
      screen: state.localTracks.has("screen"),
    },
  });
  syncControlState();
}

function syncControlState() {
  const media = state.self?.media ?? {};
  elements.audio.setAttribute("aria-pressed", String(Boolean(media.audio || state.localTracks.get("audio")?.track.enabled)));
  elements.camera.setAttribute("aria-pressed", String(Boolean(media.camera || state.localTracks.has("camera"))));
  elements.screen.setAttribute("aria-pressed", String(Boolean(media.screen || state.localTracks.has("screen"))));
  elements.audio.querySelector("span:last-child").textContent = elements.audio.getAttribute("aria-pressed") === "true" ? "麦克风已开" : "麦克风";
  elements.camera.querySelector("span:last-child").textContent = elements.camera.getAttribute("aria-pressed") === "true" ? "关闭摄像头" : "摄像头";
  elements.screen.querySelector("span:last-child").textContent = elements.screen.getAttribute("aria-pressed") === "true" ? "停止共享" : "共享屏幕";
}

function createOrUpdateMediaTile(id, stream, label, muted) {
  let tile = document.getElementById(id);
  if (!tile) {
    tile = document.createElement("div");
    tile.id = id;
    tile.className = "media-tile";
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    const caption = document.createElement("span");
    caption.className = "media-label";
    tile.append(video, caption);
    elements.mediaGrid.append(tile);
  }
  tile.querySelector("video").srcObject = stream;
  tile.querySelector(".media-label").textContent = label;
  elements.stageEmpty.hidden = true;
}

function removeMediaTile(id) {
  document.getElementById(id)?.remove();
  if (!elements.mediaGrid.querySelector(".media-tile")) elements.stageEmpty.hidden = false;
}

function updateMediaLabels() {
  for (const peerId of state.peers.keys()) {
    const label = document.querySelector(`#peer-${CSS.escape(peerId)} .media-label`);
    if (label) label.textContent = participantName(peerId);
  }
}

function closePeer(peerId) {
  state.peers.get(peerId)?.pc.close();
  state.peers.delete(peerId);
  removeMediaTile(`peer-${peerId}`);
}

function closeAllPeers() {
  for (const peerId of [...state.peers.keys()]) closePeer(peerId);
}

function selectPanel(panel) {
  const context = panel === "context";
  $("#collab-view").hidden = context;
  $("#context-view").hidden = !context;
  $("#tab-collab").classList.toggle("is-active", !context);
  $("#tab-context").classList.toggle("is-active", context);
  $("#tab-collab").setAttribute("aria-selected", String(!context));
  $("#tab-context").setAttribute("aria-selected", String(context));
}

elements.displayName.value = localStorage.getItem("dsh-meeting-name") ?? "";
const savedTheme = localStorage.getItem("dsh-meeting-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
updateMediaAccessNotice();

$("#theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("dsh-meeting-theme", next);
});

$("#create-room").addEventListener("click", () => {
  if (currentName()) elements.createDialog.showModal();
});
$("#refresh-rooms").addEventListener("click", () => send("rooms:list"));
elements.createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.createDialog.close();
    return;
  }
  createRoom();
});
elements.leaveRoom.addEventListener("click", () => send("room:leave"));
elements.audio.addEventListener("click", toggleAudio);
elements.camera.addEventListener("click", toggleCamera);
elements.screen.addEventListener("click", toggleScreen);
$("#empty-share").addEventListener("click", toggleScreen);
$("#tab-collab").addEventListener("click", () => selectPanel("collab"));
$("#tab-context").addEventListener("click", () => selectPanel("context"));

elements.contextForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.contextInput.value.trim();
  if (!text) return;
  send("transcript:add", { text });
  elements.contextInput.value = "";
});

elements.agentAction.addEventListener("click", () => {
  const prompt = "根据当前会议讨论，整理一个可执行的开发任务，并保留关键约束";
  send("agent:request", { prompt });
  selectPanel("context");
});

window.addEventListener("beforeunload", () => {
  state.manualLeave = true;
  stopAllLocalMedia();
});

connect();
