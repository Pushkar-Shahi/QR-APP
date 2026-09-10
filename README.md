# QRDrop: Fast P2P Share

Build QRDrop: a fast, privacy-focused browser-to-browser P2P file transfer web app. Use WebRTC DataChannels for direct peer-to-peer data transfer (16 KB chunks, backpressure handling, transfer speeds, ETA, and progress metrics) and Lovable Cloud Realtime channels for signaling (SDP offer/answer, ICE candidates, accept/reject). Features: high-contrast SVG QR code generation, mobile camera QR scanner with manual fallback URL, multi-file and folder selection with relative paths, sender/receiver real-time states, and tiered download assembly (File System Access / OPFS / Blob). Deliver a clean, responsive dark/light utility interface.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fast-qr-transfer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a218bc45-7083-48f2-8394-54b762d4c1a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
