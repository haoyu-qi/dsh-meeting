window.__ModuleLoader__.load({
  id: "dsh-meeting",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const css = `
      :root{--dshm-chat-width:390px;--dshm-sidebar-width:280px}
      .dshm-launcher{pointer-events:auto;position:absolute;right:14px;top:12px;z-index:30;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);padding:0 13px;font:500 13px/1 var(--ds-font-family-base,system-ui);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent);cursor:pointer}
      .dshm-launcher:hover{background:var(--dsw-alias-button-floating-hover)}
      .dshm-launcher:active,.dshm-button:active,.dshm-control:active{transform:translateY(1px)}
      body.dshm-native-active div:has(> [data-shell-overlay])>div:nth-child(2){position:absolute;z-index:22;top:0;right:0;bottom:0;width:var(--dshm-chat-width);border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:-16px 0 36px color-mix(in srgb,var(--dsw-alias-bg-base) 78%,transparent)}
      body.dshm-native-active div:has(> [data-shell-overlay])>div:nth-child(3){display:none}
      .dshm-native-shell{pointer-events:auto;position:absolute;z-index:20;top:0;right:var(--dshm-chat-width);bottom:0;left:var(--dshm-sidebar-width);display:flex;min-width:0;container-type:inline-size;flex-direction:column;overflow:hidden;border-right:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-base,system-ui)}
      .dshm-topbar{height:56px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
      .dshm-title{min-width:0;display:flex;align-items:center;gap:10px}.dshm-titlemark{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-size:10px;font-weight:700;letter-spacing:-.02em}.dshm-titlecopy{min-width:0}.dshm-titlecopy strong,.dshm-titlecopy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshm-titlecopy strong{font-size:14px;font-weight:600}.dshm-titlecopy span{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:11px}
      .dshm-topactions,.dshm-row,.dshm-controls{display:flex;align-items:center;gap:8px}.dshm-status{color:var(--dsw-alias-label-tertiary);font-size:11px}.dshm-status[data-ready=true]{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary))}.dshm-button,.dshm-control{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font:500 12px/1 var(--ds-font-family-base,system-ui);cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .1s ease}.dshm-button{height:34px;padding:0 12px}.dshm-button:hover,.dshm-control:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dshm-button[data-primary=true]{border-color:transparent;background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}.dshm-button[data-danger=true]{color:var(--dsw-alias-state-error-primary)}.dshm-button:disabled{opacity:.45;cursor:not-allowed}
      .dshm-lobby{flex:1;min-height:0;display:grid;grid-template-columns:minmax(320px,.8fr) minmax(360px,1.2fr);gap:28px;padding:28px;overflow:auto}.dshm-lobbyIntro{align-self:center;max-width:520px}.dshm-kicker{margin:0 0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}.dshm-lobby h1{max-width:12ch;margin:0;font-size:clamp(30px,3.5vw,50px);font-weight:600;line-height:1.04;letter-spacing:-.045em}.dshm-lobbyLead{max-width:44ch;margin:18px 0 0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1.65}.dshm-form{display:grid;gap:12px;margin-top:28px}.dshm-field{display:grid;gap:6px}.dshm-field label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.dshm-field input,.dshm-contextForm textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:400 13px/1.45 var(--ds-font-family-base,system-ui);outline:none}.dshm-field input{height:40px;padding:0 11px}.dshm-field input:focus,.dshm-contextForm textarea:focus{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-interactive-bg-active) 45%,transparent)}.dshm-field input::placeholder,.dshm-contextForm textarea::placeholder{color:var(--dsw-alias-label-tertiary)}.dshm-formGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .dshm-roomBrowser{align-self:center;min-height:420px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));overflow:hidden}.dshm-sectionHead{height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshm-sectionHead strong{font-size:13px;font-weight:600}.dshm-sectionHead span{color:var(--dsw-alias-label-tertiary);font-size:11px}.dshm-roomList{padding:8px}.dshm-room{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;padding:13px 10px;border-radius:9px}.dshm-room:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshm-room strong,.dshm-room span{display:block}.dshm-room strong{font-size:13px;font-weight:500}.dshm-room span{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:11px}.dshm-empty{min-height:330px;display:grid;place-items:center;padding:28px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6;white-space:pre-line}
      .dshm-roomLayout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 286px}.dshm-stage{min-width:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)}.dshm-stageHead{height:48px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshm-stageHead strong{font-size:13px;font-weight:600}.dshm-topic{max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px}.dshm-mediaGrid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));grid-auto-rows:minmax(180px,1fr);gap:8px;padding:8px;overflow:auto;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}.dshm-mediaEmpty{grid-column:1/-1;display:grid;place-items:center;align-content:center;gap:10px;min-height:320px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-tertiary);text-align:center}.dshm-mediaEmpty strong{color:var(--dsw-alias-label-primary);font-size:15px}.dshm-mediaEmpty p{max-width:36ch;margin:0;font-size:12px;line-height:1.6}.dshm-video{position:relative;min-height:180px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:#121615}.dshm-video video{width:100%;height:100%;display:block;object-fit:cover}.dshm-video span{position:absolute;left:10px;bottom:9px;padding:5px 8px;border-radius:7px;background:rgba(13,18,16,.76);color:#f2f6f4;font-size:11px;backdrop-filter:blur(8px)}
      .dshm-controls{height:58px;flex:none;justify-content:center;border-top:1px solid var(--dsw-alias-border-l2)}.dshm-control{height:34px;min-width:84px;padding:0 12px}.dshm-control[aria-pressed=true]{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}
      .dshm-rail{min-width:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}.dshm-railTabs{height:48px;flex:none;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshm-tab{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:500 12px/1 var(--ds-font-family-base,system-ui);cursor:pointer}.dshm-tab[aria-selected=true]{box-shadow:inset 0 -2px var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary)}.dshm-railBody{flex:1;min-height:0;overflow:auto}.dshm-members,.dshm-context{padding:10px}.dshm-member{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:9px;padding:9px 7px;border-radius:9px}.dshm-member:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshm-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--dsw-alias-interactive-bg-active);font-size:12px;font-weight:600}.dshm-member strong,.dshm-member span{display:block}.dshm-member strong{font-size:12px;font-weight:500}.dshm-member span{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px}.dshm-mediaState{display:flex;gap:3px}.dshm-mediaState i{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:9px;font-style:normal}.dshm-mediaState i[data-on=true]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}
      .dshm-context{display:grid;gap:8px}.dshm-contextItem{padding:10px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover)}.dshm-contextMeta{display:flex;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:10px}.dshm-contextMeta strong{color:var(--dsw-alias-label-secondary);font-weight:500}.dshm-contextItem p{margin:6px 0 0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;word-break:break-word}.dshm-contextForm{flex:none;padding:10px;border-top:1px solid var(--dsw-alias-border-l2)}.dshm-contextForm textarea{min-height:66px;padding:9px;resize:none}.dshm-contextForm .dshm-button{width:100%;margin-top:7px}
      .dshm-notice{margin:10px;padding:10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:9px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.5}.dshm-toasts{pointer-events:none;position:absolute;z-index:40;right:calc(var(--dshm-chat-width) + 14px);bottom:14px;display:grid;gap:7px}.dshm-toast{max-width:320px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);box-shadow:0 10px 28px color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent);font-size:12px}.dshm-toast[data-error=true]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
      @media(max-width:1180px){:root{--dshm-chat-width:340px}.dshm-roomLayout{grid-template-columns:minmax(0,1fr) 250px}.dshm-lobby{grid-template-columns:1fr;padding:20px}.dshm-lobbyIntro{align-self:start}.dshm-roomBrowser{align-self:start;min-height:300px}.dshm-empty{min-height:220px}}
      @media(max-width:900px){body.dshm-native-active div:has(> [data-shell-overlay])>div:nth-child(2){display:none}.dshm-native-shell{right:0}.dshm-roomLayout{grid-template-columns:1fr;overflow:auto;display:block}.dshm-stage{min-height:400px}.dshm-rail{display:flex;min-height:280px;border-left:0;border-top:1px solid var(--dsw-alias-border-l2)}.dshm-status{display:none}}
      @container(max-width:850px){.dshm-lobby{grid-template-columns:1fr;gap:22px;padding:20px}.dshm-lobbyIntro{align-self:start;max-width:560px}.dshm-lobby h1{max-width:18ch;font-size:clamp(30px,7cqw,40px)}.dshm-form{max-width:560px;margin-top:22px}.dshm-roomBrowser{align-self:start;min-height:260px}.dshm-empty{min-height:180px}.dshm-roomLayout{grid-template-columns:minmax(0,1fr) 220px}}
      @container(max-width:520px){.dshm-formGrid{grid-template-columns:1fr}.dshm-roomLayout{grid-template-columns:1fr;overflow:auto;display:block}.dshm-stage{min-height:400px}.dshm-rail{display:flex;min-height:280px;border-left:0;border-top:1px solid var(--dsw-alias-border-l2)}.dshm-topic{display:none}.dshm-control{min-width:0;flex:1}}
      @media(prefers-reduced-motion:reduce){.dshm-button,.dshm-control{transition:none}}
    `;
    const tagId = "dsh-meeting/native.css";
    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-meeting";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function meetingOrigin() {
      const protocol = window.location.protocol === "https:" ? "https:" : "http:";
      const hostname = window.location.hostname || "localhost";
      return `${protocol}//${hostname}:4173`;
    }

    function meetingSocketUrl() {
      return `${meetingOrigin().replace(/^http/, "ws")}/ws`;
    }

    function mediaIssue(method, feature) {
      if (navigator.mediaDevices && typeof navigator.mediaDevices[method] === "function") return null;
      if (!window.isSecureContext) return `${feature}需要 localhost 或 HTTPS 安全连接。`;
      return `当前浏览器不支持${feature}。`;
    }

    function VideoTile({ stream, label, muted }) {
      const ref = useRef(null);
      useEffect(() => {
        if (ref.current) ref.current.srcObject = stream;
        return () => {
          if (ref.current) ref.current.srcObject = null;
        };
      }, [stream]);
      return h("div", { className: "dshm-video" },
        h("video", { ref, autoPlay: true, playsInline: true, muted }),
        h("span", null, label),
      );
    }

    function MeetingWorkspace({ onClose }) {
      const [connection, setConnection] = useState("connecting");
      const [self, setSelf] = useState(null);
      const [rooms, setRooms] = useState([]);
      const [room, setRoom] = useState(null);
      const [name, setName] = useState(() => localStorage.getItem("dsh-meeting-name") || "");
      const [project, setProject] = useState("");
      const [roomName, setRoomName] = useState("");
      const [contextText, setContextText] = useState("");
      const [railTab, setRailTab] = useState("members");
      const [tiles, setTiles] = useState([]);
      const [mediaRevision, setMediaRevision] = useState(0);
      const [toasts, setToasts] = useState([]);
      const socketRef = useRef(null);
      const selfRef = useRef(null);
      const roomRef = useRef(null);
      const peersRef = useRef(new Map());
      const localTracksRef = useRef(new Map());
      const mediaEpochRef = useRef(0);
      const pendingMediaRef = useRef(new Set());

      const toast = useCallback((message, error = false) => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((items) => [...items.slice(-2), { id, message, error }]);
        window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
      }, []);

      const send = useCallback((type, payload = {}) => {
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          toast("协作服务尚未连接", true);
          return false;
        }
        socketRef.current.send(JSON.stringify({ type, ...payload }));
        return true;
      }, [toast]);

      const closePeer = useCallback((peerId) => {
        peersRef.current.get(peerId)?.pc.close();
        peersRef.current.delete(peerId);
        setTiles((items) => items.filter((item) => item.id !== `peer-${peerId}`));
      }, []);

      const resetMedia = useCallback(() => {
        mediaEpochRef.current += 1;
        pendingMediaRef.current.clear();
        for (const peerId of [...peersRef.current.keys()]) closePeer(peerId);
        for (const { stream } of localTracksRef.current.values()) {
          for (const track of stream.getTracks()) track.stop();
        }
        localTracksRef.current.clear();
        setTiles([]);
        setMediaRevision((value) => value + 1);
      }, [closePeer]);

      const setRoomSnapshot = useCallback((snapshot) => {
        if (!snapshot || roomRef.current?.id !== snapshot.id) resetMedia();
        roomRef.current = snapshot;
        setRoom(snapshot);
      }, [resetMedia]);

      const acquireMedia = useCallback(async (key, method, feature, constraints) => {
        if (!roomRef.current || pendingMediaRef.current.has(key)) return null;
        const issue = mediaIssue(method, feature);
        if (issue) { toast(issue, true); return null; }
        const epoch = mediaEpochRef.current;
        pendingMediaRef.current.add(key);
        try {
          const stream = await navigator.mediaDevices[method](constraints);
          if (epoch !== mediaEpochRef.current || !roomRef.current) {
            for (const track of stream.getTracks()) track.stop();
            return null;
          }
          return stream;
        } finally {
          if (epoch === mediaEpochRef.current) pendingMediaRef.current.delete(key);
        }
      }, [toast]);

      const participantName = useCallback((peerId) => {
        return roomRef.current?.participants.find((participant) => participant.id === peerId)?.name || "协作成员";
      }, []);

      const ensurePeer = useCallback((peerId) => {
        if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);
        if (!selfRef.current || typeof RTCPeerConnection !== "function") return null;
        const pc = new RTCPeerConnection({ iceServers: [] });
        const peer = {
          pc,
          polite: selfRef.current.id.localeCompare(peerId) > 0,
          makingOffer: false,
          ignoreOffer: false,
          isSettingRemoteAnswerPending: false,
          stream: new MediaStream(),
        };
        peersRef.current.set(peerId, peer);
        for (const { track, stream } of localTracksRef.current.values()) pc.addTrack(track, stream);
        pc.addEventListener("icecandidate", ({ candidate }) => {
          if (candidate) send("signal", { targetId: peerId, payload: { candidate } });
        });
        pc.addEventListener("negotiationneeded", async () => {
          try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            send("signal", { targetId: peerId, payload: { description: pc.localDescription } });
          } catch (error) {
            toast(`媒体协商失败：${error?.message || "未知错误"}`, true);
          } finally {
            peer.makingOffer = false;
          }
        });
        pc.addEventListener("track", ({ track }) => {
          if (!peer.stream.getTracks().some((current) => current.id === track.id)) peer.stream.addTrack(track);
          setTiles((items) => [...items.filter((item) => item.id !== `peer-${peerId}`), { id: `peer-${peerId}`, stream: peer.stream, label: participantName(peerId), muted: false }]);
          track.addEventListener("ended", () => {
            peer.stream.removeTrack(track);
            if (!peer.stream.getTracks().length) setTiles((items) => items.filter((item) => item.id !== `peer-${peerId}`));
          }, { once: true });
        });
        pc.addEventListener("connectionstatechange", () => {
          if (["failed", "closed"].includes(pc.connectionState)) closePeer(peerId);
        });
        return peer;
      }, [closePeer, participantName, send, toast]);

      const handleSignal = useCallback(async (peerId, payload) => {
        if (!payload || !roomRef.current?.participants.some((item) => item.id === peerId) || peerId === selfRef.current?.id) return;
        const peer = ensurePeer(peerId);
        if (!peer) return;
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
          toast(`无法连接 ${participantName(peerId)}：${error?.message || "未知错误"}`, true);
        }
      }, [ensurePeer, participantName, send, toast]);

      useEffect(() => {
        let disposed = false;
        let reconnectTimer = null;
        let reconnectAttempt = 0;
        const connect = () => {
          if (disposed) return;
          setConnection("connecting");
          const socket = new WebSocket(meetingSocketUrl());
          socketRef.current = socket;
          socket.addEventListener("open", () => {
            if (disposed) return;
            reconnectAttempt = 0;
            setConnection("ready");
          });
          socket.addEventListener("message", async (event) => {
            if (disposed) return;
            const message = JSON.parse(event.data);
            if (message.type === "session:ready") {
              selfRef.current = message.self;
              setSelf(message.self);
              setRooms(message.rooms);
            } else if (message.type === "rooms:snapshot") setRooms(message.rooms);
            else if (message.type === "room:state") setRoomSnapshot(message.room);
            else if (message.type === "room:left") setRoomSnapshot(null);
            else if (message.type === "signal") await handleSignal(message.fromId, message.payload);
            else if (message.type === "error") toast(message.message, true);
          });
          socket.addEventListener("close", () => {
            if (disposed) return;
            setConnection("error");
            setRoomSnapshot(null);
            selfRef.current = null;
            setSelf(null);
            setRooms([]);
            reconnectTimer = window.setTimeout(connect, Math.min(1200 * 2 ** reconnectAttempt++, 15000));
          });
          socket.addEventListener("error", () => { if (!disposed) setConnection("error"); });
        };
        connect();
        return () => {
          disposed = true;
          window.clearTimeout(reconnectTimer);
          socketRef.current?.close();
        };
      }, [handleSignal, setRoomSnapshot, toast]);

      useEffect(() => {
        if (!room || !self) return;
        const memberIds = new Set(room.participants.map((participant) => participant.id));
        memberIds.delete(self.id);
        for (const peerId of memberIds) ensurePeer(peerId);
        for (const peerId of peersRef.current.keys()) if (!memberIds.has(peerId)) closePeer(peerId);
      }, [room, self, closePeer, ensurePeer]);

      useEffect(() => () => {
        roomRef.current = null;
        resetMedia();
      }, [resetMedia]);

      const currentName = useCallback(() => {
        const value = name.trim();
        if (!value) {
          toast("请先填写姓名", true);
          return null;
        }
        localStorage.setItem("dsh-meeting-name", value);
        return value;
      }, [name, toast]);

      const createRoom = useCallback((event) => {
        event.preventDefault();
        const displayName = currentName();
        if (!displayName) return;
        if (!project.trim() || !roomName.trim()) {
          toast("请填写项目与协作名称", true);
          return;
        }
        send("room:create", { name: displayName, project: project.trim(), roomName: roomName.trim() });
      }, [currentName, project, roomName, send, toast]);

      const joinRoom = useCallback((roomId) => {
        const displayName = currentName();
        if (displayName) send("room:join", { roomId, name: displayName });
      }, [currentName, send]);

      const removeLocalTrack = useCallback((key) => {
        const current = localTracksRef.current.get(key);
        if (!current) return;
        for (const { pc } of peersRef.current.values()) {
          const sender = pc.getSenders().find((item) => item.track === current.track);
          if (sender) pc.removeTrack(sender);
        }
        for (const track of current.stream.getTracks()) track.stop();
        localTracksRef.current.delete(key);
        setTiles((items) => items.filter((item) => item.id !== `local-${key}`));
        setMediaRevision((value) => value + 1);
      }, []);

      const publishMedia = useCallback(() => {
        const audio = localTracksRef.current.get("audio")?.track.enabled || false;
        send("media:update", { media: { audio, camera: localTracksRef.current.has("camera"), screen: localTracksRef.current.has("screen") } });
        setMediaRevision((value) => value + 1);
      }, [send]);

      const addTrackToPeers = useCallback((track, stream) => {
        for (const { pc } of peersRef.current.values()) pc.addTrack(track, stream);
      }, []);

      const toggleAudio = useCallback(async () => {
        const current = localTracksRef.current.get("audio");
        if (current) {
          current.track.enabled = !current.track.enabled;
          publishMedia();
          return;
        }
        try {
          const stream = await acquireMedia("audio", "getUserMedia", "麦克风", { audio: true });
          if (!stream) return;
          const track = stream.getAudioTracks()[0];
          localTracksRef.current.set("audio", { track, stream });
          addTrackToPeers(track, stream);
          publishMedia();
        } catch (error) {
          toast(`无法使用麦克风：${error?.message || "浏览器拒绝了请求"}`, true);
        }
      }, [acquireMedia, addTrackToPeers, publishMedia, toast]);

      const toggleCamera = useCallback(async () => {
        if (localTracksRef.current.has("camera")) {
          removeLocalTrack("camera");
          publishMedia();
          return;
        }
        try {
          const stream = await acquireMedia("camera", "getUserMedia", "摄像头", { video: true });
          if (!stream) return;
          const track = stream.getVideoTracks()[0];
          localTracksRef.current.set("camera", { track, stream });
          addTrackToPeers(track, stream);
          setTiles((items) => [...items.filter((item) => item.id !== "local-camera"), { id: "local-camera", stream, label: "你的摄像头", muted: true }]);
          publishMedia();
        } catch (error) {
          toast(`无法使用摄像头：${error?.message || "浏览器拒绝了请求"}`, true);
        }
      }, [acquireMedia, addTrackToPeers, publishMedia, removeLocalTrack, toast]);

      const toggleScreen = useCallback(async () => {
        if (localTracksRef.current.has("screen")) {
          removeLocalTrack("screen");
          publishMedia();
          return;
        }
        try {
          const stream = await acquireMedia("screen", "getDisplayMedia", "屏幕共享", { video: true, audio: false });
          if (!stream) return;
          const track = stream.getVideoTracks()[0];
          localTracksRef.current.set("screen", { track, stream });
          addTrackToPeers(track, stream);
          setTiles((items) => [...items.filter((item) => item.id !== "local-screen"), { id: "local-screen", stream, label: "你正在共享", muted: true }]);
          track.addEventListener("ended", () => {
            if (localTracksRef.current.get("screen")?.track !== track) return;
            removeLocalTrack("screen");
            publishMedia();
          }, { once: true });
          publishMedia();
        } catch (error) {
          if (error?.name !== "NotAllowedError") toast(`无法共享屏幕：${error?.message || "浏览器拒绝了请求"}`, true);
        }
      }, [acquireMedia, addTrackToPeers, publishMedia, removeLocalTrack, toast]);

      const submitContext = useCallback((event) => {
        event.preventDefault();
        const text = contextText.trim();
        if (!text) return;
        if (send("transcript:add", { text })) setContextText("");
      }, [contextText, send]);

      const audioOn = localTracksRef.current.get("audio")?.track.enabled || false;
      const cameraOn = localTracksRef.current.has("camera");
      const screenOn = localTracksRef.current.has("screen");
      void mediaRevision;
      const mediaNotice = mediaIssue("getUserMedia", "摄像头和麦克风");
      const title = room ? room.name : "实时协作";
      const subtitle = room ? `${room.project} / ${room.participants.length} 人在线` : "会议与 Agent 共用一个工作区";

      return h(React.Fragment, null,
        h("section", { className: "dshm-native-shell", "aria-label": "DSH Meeting 原生协作工作区" },
          h("header", { className: "dshm-topbar" },
            h("div", { className: "dshm-title" },
              h("span", { className: "dshm-titlemark", "aria-hidden": true }, "DSH"),
              h("div", { className: "dshm-titlecopy" }, h("strong", null, title), h("span", null, subtitle)),
            ),
            h("div", { className: "dshm-topactions" },
              h("span", { className: "dshm-status", "data-ready": connection === "ready" }, connection === "ready" ? "已连接" : connection === "error" ? "连接中断" : "正在连接"),
              room && h("button", { className: "dshm-button", "data-danger": true, type: "button", onClick: () => send("room:leave") }, "退出协作"),
              h("button", { className: "dshm-button", type: "button", onClick: onClose }, "收起会议"),
            ),
          ),
          !room ? h("div", { className: "dshm-lobby" },
            h("section", { className: "dshm-lobbyIntro" },
              h("p", { className: "dshm-kicker" }, "局域网实时协作"),
              h("h1", null, "让会议成为 Agent 的当前上下文"),
              h("p", { className: "dshm-lobbyLead" }, "会议画面在主区展开，DSH 文字交互保留在右侧，讨论和执行不再切换窗口。"),
              h("form", { className: "dshm-form", onSubmit: createRoom },
                h("div", { className: "dshm-field" }, h("label", { htmlFor: "dshm-name" }, "你的姓名"), h("input", { id: "dshm-name", value: name, onChange: (event) => setName(event.target.value), maxLength: 32, placeholder: "例如：齐浩宇" })),
                h("div", { className: "dshm-formGrid" },
                  h("div", { className: "dshm-field" }, h("label", { htmlFor: "dshm-project" }, "项目"), h("input", { id: "dshm-project", value: project, onChange: (event) => setProject(event.target.value), maxLength: 48, placeholder: "DSH" })),
                  h("div", { className: "dshm-field" }, h("label", { htmlFor: "dshm-room" }, "协作名称"), h("input", { id: "dshm-room", value: roomName, onChange: (event) => setRoomName(event.target.value), maxLength: 48, placeholder: "需求评审" })),
                ),
                h("button", { className: "dshm-button", "data-primary": true, type: "submit", disabled: connection !== "ready" }, "创建协作"),
              ),
              mediaNotice && h("div", { className: "dshm-notice" }, mediaNotice),
            ),
            h("aside", { className: "dshm-roomBrowser", "aria-label": "附近协作" },
              h("div", { className: "dshm-sectionHead" }, h("strong", null, "附近协作"), h("button", { className: "dshm-button", type: "button", onClick: () => send("rooms:list") }, "刷新")),
              rooms.length ? h("div", { className: "dshm-roomList" }, rooms.map((item) => h("article", { className: "dshm-room", key: item.id },
                h("div", null, h("strong", null, item.name), h("span", null, `${item.project} / ${item.participantCount} 人在线`)),
                h("button", { className: "dshm-button", type: "button", onClick: () => joinRoom(item.id) }, "加入"),
              ))) : h("div", { className: "dshm-empty" }, h("span", null, "还没有可加入的协作。\n创建一个房间后，同一局域网的成员即可进入。")),
            ),
          ) : h("div", { className: "dshm-roomLayout" },
            h("section", { className: "dshm-stage" },
              h("div", { className: "dshm-stageHead" }, h("strong", null, "协作画面"), h("span", { className: "dshm-topic" }, `当前主题：${room.activeTopic}`)),
              h("div", { className: "dshm-mediaGrid" },
                tiles.length ? tiles.map((tile) => h(VideoTile, { key: tile.id, stream: tile.stream, label: tile.label, muted: tile.muted })) : h("div", { className: "dshm-mediaEmpty" },
                  h("strong", null, "还没有共享画面"),
                  h("p", null, "打开摄像头或共享屏幕，右侧 DSH 可同时继续文字交互。"),
                  h("button", { className: "dshm-button", "data-primary": true, type: "button", onClick: toggleScreen }, "共享屏幕"),
                ),
              ),
              h("div", { className: "dshm-controls", "aria-label": "会议控制" },
                h("button", { className: "dshm-control", type: "button", "aria-pressed": audioOn, onClick: toggleAudio }, audioOn ? "麦克风已开" : "麦克风"),
                h("button", { className: "dshm-control", type: "button", "aria-pressed": cameraOn, onClick: toggleCamera }, cameraOn ? "关闭摄像头" : "摄像头"),
                h("button", { className: "dshm-control", type: "button", "aria-pressed": screenOn, onClick: toggleScreen }, screenOn ? "停止共享" : "共享屏幕"),
              ),
            ),
            h("aside", { className: "dshm-rail" },
              h("div", { className: "dshm-railTabs", role: "tablist" },
                h("button", { className: "dshm-tab", role: "tab", "aria-selected": railTab === "members", onClick: () => setRailTab("members") }, `成员 ${room.participants.length}`),
                h("button", { className: "dshm-tab", role: "tab", "aria-selected": railTab === "context", onClick: () => setRailTab("context") }, "会议上下文"),
              ),
              h("div", { className: "dshm-railBody" }, railTab === "members" ? h("div", { className: "dshm-members" }, room.participants.map((participant) => h("div", { className: "dshm-member", key: participant.id },
                h("span", { className: "dshm-avatar", "aria-hidden": true }, participant.name.slice(0, 1).toUpperCase()),
                h("div", null, h("strong", null, participant.id === self?.id ? `${participant.name} (你)` : participant.name), h("span", null, participant.id === room.hostId ? "房主" : "成员")),
                h("div", { className: "dshm-mediaState", "aria-label": "媒体状态" }, h("i", { "data-on": participant.media.audio }, "麦"), h("i", { "data-on": participant.media.camera }, "像"), h("i", { "data-on": participant.media.screen }, "屏")),
              ))) : h("div", { className: "dshm-context" },
                room.context.filter((item) => item.kind !== "system").slice().reverse().map((item) => h("article", { className: "dshm-contextItem", key: item.id },
                  h("div", { className: "dshm-contextMeta" }, h("strong", null, item.author), h("time", { dateTime: item.at }, new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.at)))),
                  h("p", null, item.text),
                )),
                !room.context.some((item) => item.kind !== "system") && h("div", { className: "dshm-empty" }, "讨论开始后，会议上下文会出现在这里。"),
              )),
              railTab === "context" && h("form", { className: "dshm-contextForm", onSubmit: submitContext },
                h("textarea", { "aria-label": "会议讨论或决策", value: contextText, onChange: (event) => setContextText(event.target.value), maxLength: 500, placeholder: "记录一条讨论或决策" }),
                h("button", { className: "dshm-button", "data-primary": true, type: "submit", disabled: !contextText.trim() }, "写入会议上下文"),
                h("button", { className: "dshm-button", type: "button", disabled: room.agent.status === "working", onClick: () => send("agent:request", { prompt: "根据当前会议讨论，整理一个可执行的开发任务，并保留关键约束" }) }, room.agent.status === "working" ? "Agent 正在处理" : "根据讨论生成任务（演示）"),
              ),
            ),
          ),
        ),
        h("div", { className: "dshm-toasts", "aria-live": "polite" }, toasts.map((item) => h("div", { className: "dshm-toast", "data-error": item.error, key: item.id }, item.message))),
      );
    }

    function MeetingNative() {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);
      useEffect(() => {
        if (!open) return;
        document.body.classList.add("dshm-native-active");
        const overlay = rootRef.current?.closest("[data-shell-overlay]");
        const frame = overlay?.parentElement;
        const sidebar = frame?.children?.[0];
        const syncSidebar = () => {
          const width = sidebar?.getBoundingClientRect().width || 0;
          document.documentElement.style.setProperty("--dshm-sidebar-width", `${Math.round(width)}px`);
        };
        syncSidebar();
        const observer = sidebar ? new ResizeObserver(syncSidebar) : null;
        if (sidebar) observer.observe(sidebar);
        return () => {
          observer?.disconnect();
          document.body.classList.remove("dshm-native-active");
          document.documentElement.style.removeProperty("--dshm-sidebar-width");
        };
      }, [open]);
      return h("div", { ref: rootRef }, open
        ? h(MeetingWorkspace, { onClose: () => setOpen(false) })
        : h("button", { className: "dshm-launcher", type: "button", onClick: () => setOpen(true), "aria-label": "打开 DSH Meeting 原生工作区" }, "实时协作"));
    }

    const inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "dsh-meeting-native", order: 20 }, () => h(MeetingNative)));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
