const peerId = /^[A-Za-z0-9_-]{24}$/;
const protocol = 'xcenter-rtc-v1';

function localDescription(connection, description, signal) {
  return connection.setLocalDescription(description).then(async () => {
    if (connection.iceGatheringState !== 'complete') {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          connection.removeEventListener('icegatheringstatechange', ready);
        };
        const finish = (error) => { cleanup(); error ? reject(error) : resolve(); };
        const ready = () => { if (connection.iceGatheringState === 'complete') finish(); };
        const abort = () => finish(new DOMException('Connection closed', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('ICE gathering timed out.')), 15_000);
        connection.addEventListener('icegatheringstatechange', ready);
        signal.addEventListener('abort', abort, {once:true});
        if (signal.aborted) abort();
        else ready();
      });
    }
    return connection.localDescription.toJSON();
  });
}

/**
 * A browser WebRTC host backed by a verified application's X-Center signaling session.
 * The caller provides permission UI, accepts or declines incoming connections, and owns local media.
 */
export async function openPeerConnections(user, {
  discoverable = false, configuration, onInvite, onError = () => {},
} = {}) {
  const session = await user.peers.open({discoverable});
  const controller = new AbortController();
  const options = {signal:controller.signal};
  const connections = new Map();
  const pendingInvites = new Map();
  let timer;
  let stopped = false;

  function create(remoteId, attempt, stream, outgoing) {
    if (connections.size >= 32) throw new Error('Close a peer connection before opening another.');
    const connection = new RTCPeerConnection(configuration);
    try {
      if (stream) for (const track of stream.getTracks()) connection.addTrack(track, stream);
    } catch (error) { connection.close(); throw error; }
    const ended = new AbortController();
    const deadline = setTimeout(() => { entry.close(); onError(new Error('The peer connection timed out.')); },60_000);
    const key = remoteId + ':' + attempt;
    const entry = {connection, remoteId, attempt, outgoing, signal:ended.signal, close() {
      if (connections.get(key) === entry) connections.delete(key);
      clearTimeout(deadline);
      ended.abort();
      connection.close();
    }};
    connections.set(key, entry);
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'connected') clearTimeout(deadline);
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') entry.close();
    });
    return entry;
  }

  const send = (to,type,attempt,fields) => user.peers.send(session, {
    to,type,data:{protocol,attempt,...fields},
  }, options);

  async function handle(message) {
    const {from,type,data} = message;
    if (!peerId.test(from) || data?.protocol !== protocol || typeof data.attempt !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(data.attempt)) return;
    const key = from + ':' + data.attempt;
    const existing = connections.get(key);
    if (type === 'hangup') {
      pendingInvites.delete(key);
      existing?.close();
      return;
    }
    if (type === 'answer') {
      if (!existing?.outgoing || existing.attempt !== data.attempt) return;
      if (data.declined) {
        existing.close();
        throw new Error('The other peer declined the connection.');
      }
      if (existing.connection.signalingState === 'have-local-offer' && data.description?.type === 'answer') {
        try { await existing.connection.setRemoteDescription(data.description); }
        catch (error) { existing.close(); throw error; }
      }
      return;
    }
    if (type !== 'offer' || data.description?.type !== 'offer' || typeof data.description.sdp !== 'string' ||
        !['media','data'].includes(data.kind) || existing || pendingInvites.has(key) || pendingInvites.size >= 32) return;
    if (data.kind === 'data' && /^m=(audio|video) /m.test(data.description.sdp)) return;
    const invitation = Object.freeze({peerId:from,kind:data.kind});
    pendingInvites.set(key,invitation);
    let decision, accepted;
    try {
      decision = await onInvite?.(invitation);
      accepted = pendingInvites.get(key) === invitation;
    } finally {
      if (pendingInvites.get(key) === invitation) pendingInvites.delete(key);
    }
    if (stopped || !accepted) return;
    if (!decision) {
      await send(from,'answer',data.attempt,{declined:true});
      return;
    }
    const entry = create(from,data.attempt,decision.stream,false);
    try {
      decision.onConnection?.(entry.connection,() => hangup(entry));
      await entry.connection.setRemoteDescription(data.description);
      const answer = await localDescription(entry.connection, await entry.connection.createAnswer(), entry.signal);
      await send(from,'answer',data.attempt,{description:answer});
    } catch (error) { entry.close(); throw error; }
  }

  function hangup(entry) {
    if (entry.signal.aborted) return;
    entry.close();
    void send(entry.remoteId,'hangup',entry.attempt,{}).catch(error => { if (!stopped) onError(error); });
  }

  async function close() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    controller.abort();
    pendingInvites.clear();
    for (const entry of connections.values()) entry.close();
    await user.peers.close(session);
  }

  async function poll() {
    try {
      const {messages} = await user.peers.receive(session,options);
      // The application may leave its invitation dialog open. Keep polling so its peer lease survives.
      for (const message of messages) void handle(message).catch(error => { if (!stopped) onError(error); });
    } catch (error) {
      if (!stopped && [401,403,404].includes(error.status)) {
        await close().catch(() => {});
        onError(error);
        return;
      }
      if (!stopped) onError(error);
    } finally {
      if (!stopped) timer = setTimeout(poll,1000);
    }
  }
  timer = setTimeout(poll,0);

  return {
    id:session.id,
    async listDiscoverablePeers() {
      const {peers} = await user.peers.list(session,options);
      return peers;
    },
    async connect(remoteId, {stream, dataLabel, onConnection} = {}) {
      if (stopped || !peerId.test(remoteId) || remoteId === session.id) throw new TypeError('Choose another peer in this app.');
      const attempt = crypto.randomUUID();
      const entry = create(remoteId,attempt,stream,true);
      try {
        const channel = dataLabel != null || !stream ? entry.connection.createDataChannel(dataLabel ?? 'data') : undefined;
        onConnection?.(entry.connection);
        const description = await localDescription(entry.connection, await entry.connection.createOffer(), entry.signal);
        await send(remoteId,'offer',attempt,{description,kind:stream ? 'media' : 'data'});
        return {connection:entry.connection,channel,close:() => hangup(entry)};
      } catch (error) { entry.close(); throw error; }
    },
    close,
  };
}

/** Send a Blob on an ordered, reliable channel. The application sends file metadata separately. */
export async function sendPeerFile(channel, file, {signal, onProgress} = {}) {
  if (!channel.ordered || channel.maxRetransmits != null || channel.maxPacketLifeTime != null) {
    throw new TypeError('A reliable, ordered data channel is required.');
  }
  const chunkSize = 16 * 1024;
  const threshold = 256 * 1024;
  const check = () => {
    signal?.throwIfAborted();
    if (channel.readyState !== 'open') throw new Error('The data channel is closed.');
  };
  check();
  for (let offset=0; offset<file.size; offset+=chunkSize) {
    check();
    while (channel.bufferedAmount > threshold) {
      await new Promise(resolve => setTimeout(resolve,25));
      check();
    }
    const chunk = await file.slice(offset,offset+chunkSize).arrayBuffer();
    check();
    channel.send(chunk);
    onProgress?.(offset+chunk.byteLength,file.size);
  }
}
