# Peer connections with X-Center ID

Enable **Peer connections** for a verified registration in Developer Apps. All peers connect with a signed-in user token from that registration. To enable the directory, turn on **List discoverable peers in this app** and open the peer that should appear with `discoverable: true`. A peer can use the directory even when it opts out of being listed. The directory contains only other discoverable peers that share the caller’s registration. No app can enumerate or signal another app’s peers, even when both apps use the same signed-in account.

In the low-level SDK, open with `user.peers.open({discoverable: true})`, then call `user.peers.list(session)`. Keep the session proof private. Return or share the peer ID through your authenticated app when using invitations without discovery.

## Browser calls and data

Install `@xcenter-id/web` and import its `/peers` entry point. It sets up WebRTC using X-Center ID signaling. Supply the application's consent and call UI. Open one host per active app session and close it during sign-out, account changes and screen teardown.

```js
import {openPeerConnections, sendPeerFile} from "@xcenter-id/web/peers";

const host = await openPeerConnections(user, {
  discoverable: true,
  configuration: {iceServers: appIceServers},
  async onInvite({peerId, kind}) {
    const accepted = await showIncomingInvitation(peerId, kind);
    if (!accepted) return false;
    return {
      stream: kind === "media" ? await openApprovedMicrophoneOrCamera() : undefined,
      onConnection(connection, close) {
        attachRemoteTracks(connection);
        connection.ondatachannel = ({channel}) => configureIncomingChannel(channel);
        bindHangUp(close);
      },
    };
  },
  onError: showPeerError,
});

const ids = await host.listDiscoverablePeers();
// Inside the user's Call action:
const media = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
const call = await host.connect(ids[0], {
  stream: media, dataLabel: "transfer", onConnection: attachRemoteTracks,
});
```

Use `video: false` for voice only. Attach the remote stream in the connection’s `track` listener. Put permissions behind user actions. The helper closes connections and signaling, and the app stops any microphone, camera, and screen tracks it opened. A peer pair can have parallel media and data connections. Closing one connection sends a hang-up signal for that connection. The browser adapter implements these WebRTC capabilities through the X-Center SDK API. The helper waits for ICE gathering before exchanging SDP. Configure STUN and TURN for the networks your application supports. Native Swift, Kotlin, and Dart apps can use the existing low-level signaling adapters with their own WebRTC media and capture implementations.

## Screen sharing

From a user-initiated button on a supported browser, call `navigator.mediaDevices.getDisplayMedia({video: true})`. Pass the chosen screen stream to a new connection, or use `replaceTrack` on the existing video sender. When the screen track ends or the user selects Stop, restore the camera track if appropriate and stop the display tracks. If a voice-only connection has no video sender, start a separate media connection after closing it, or use an app-owned negotiation flow. Browser and OS support varies. The user must choose what to share in the system picker.

## File transfer

After the receiving user accepts a file, declare its bounded size and name using your own protocol, then call `await sendPeerFile(channel, file, {signal, onProgress})` on an open, reliable, ordered data channel. The helper sends bounded binary chunks with backpressure. Use a dedicated channel or serialize files, set `binaryType = "arraybuffer"`, enforce the declared byte count and receiver’s file-size limit, and write to a user-approved destination. Discard incomplete transfers. Treat file names and content as untrusted. The progress callback reports bytes queued locally. Use a receiver acknowledgment to confirm completed writes. Audio, video and file bytes travel through WebRTC. X-Center ID handles signaling only. TURN may relay encrypted traffic when direct transport is unavailable.

[X-Center ID peer discovery reference](https://id.xcenter.it/docs/sdk/list-peers)
