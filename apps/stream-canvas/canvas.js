const WS_URL = 'ws://localhost:8080/ws';

const els = {
  frameBg: document.getElementById('frame-bg'),
  framePrev: document.getElementById('frame-prev'),
  location: document.getElementById('location'),
  road: document.getElementById('road'),
  viewerCount: document.getElementById('viewer-count'),
  progressBar: document.getElementById('progress-bar'),
  milesDone: document.getElementById('miles-done'),
  milesLeft: document.getElementById('miles-left'),
  axleLabel: document.getElementById('axle-label'),
  axleText: document.getElementById('axle-text'),
  chatOverlay: document.getElementById('chat-overlay'),
  milesNum: document.getElementById('miles-num'),
  milestone: document.getElementById('milestone'),
  milestoneName: document.getElementById('milestone-name'),
  pauseOverlay: document.getElementById('pause-overlay'),
  audio: document.getElementById('audio'),
};

let chatMessages = [];
let audioQueue = [];
let milestoneTimer = null;

function updateChat() {
  const recent = chatMessages.slice(-6);
  els.chatOverlay.innerHTML = recent.map(m => `
    <div class="chat-msg">
      <span class="chat-username source-${m.source}">${m.username}</span>
      <span>${m.message}</span>
    </div>
  `).join('');
}

function showMilestone(name) {
  els.milestoneName.textContent = name;
  els.milestone.classList.add('show');
  if (milestoneTimer) clearTimeout(milestoneTimer);
  milestoneTimer = setTimeout(() => els.milestone.classList.remove('show'), 8000);
}

function playNextAudio() {
  if (audioQueue.length === 0 || !els.audio.paused) return;
  els.audio.src = audioQueue.shift();
  els.audio.play().catch(() => playNextAudio());
}

els.audio.addEventListener('ended', playNextAudio);

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (e) => {
    const { type, payload } = JSON.parse(e.data);

    switch (type) {
      case 'INIT':
        if (payload?.last_frame_url) els.frameBg.src = payload.last_frame_url;
        if (payload?.is_paused) els.pauseOverlay.classList.add('show');
        break;

      case 'NEW_FRAME': {
        if (!payload.frameUrl) break;
        // Crossfade
        els.framePrev.src = els.frameBg.src;
        els.frameBg.style.opacity = 0;
        els.frameBg.src = payload.frameUrl;
        els.frameBg.onload = () => { els.frameBg.style.opacity = 1; };

        els.location.textContent = `${payload.city ?? '—'}, ${payload.state ?? '—'}`;
        els.road.textContent = payload.roadName ?? '';
        els.milesNum.textContent = Math.round(payload.miles || 0).toLocaleString();
        els.milesDone.textContent = `Mile ${Math.round(payload.miles || 0)}`;
        els.milesLeft.textContent = `NYC → LA · ${Math.round(payload.milesRemaining || 0)} mi to go`;

        const total = (payload.miles || 0) + (payload.milesRemaining || 1);
        const pct = ((payload.miles || 0) / total) * 100;
        els.progressBar.style.width = `${pct}%`;

        if (payload.isMilestone && payload.milestoneName) showMilestone(payload.milestoneName);
        break;
      }

      case 'COMMENTARY':
        els.axleLabel.textContent = payload.thinking ? 'AXLE · thinking...' : 'AXLE · speaking';
        if (!payload.thinking) els.axleText.textContent = payload.text || 'Rolling...';
        break;

      case 'AUDIO_READY':
        if (audioQueue.length < 3) audioQueue.push(payload.audioUrl);
        playNextAudio();
        break;

      case 'CHAT_MESSAGE':
      case 'CHAT_RESPONSE': {
        const msg = type === 'CHAT_RESPONSE'
          ? { username: 'AXLE', message: payload.text, source: 'axle' }
          : { username: payload.username, message: payload.message, source: payload.source };
        chatMessages.push(msg);
        if (chatMessages.length > 20) chatMessages.shift();
        updateChat();
        break;
      }

      case 'VIEWER_COUNT':
        els.viewerCount.textContent = `${(payload.count || 0).toLocaleString()} watching`;
        break;

      case 'RIDER_PAUSED':
        els.pauseOverlay.classList.add('show');
        break;

      case 'RIDER_RESUMED':
        els.pauseOverlay.classList.remove('show');
        break;

      case 'MILESTONE':
        showMilestone(payload.name);
        break;
    }
  };

  ws.onclose = () => setTimeout(connect, 2000);
}

connect();
