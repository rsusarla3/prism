# Prism — LAN / Car Setup (shared backend)

Use **one teammate's laptop as the Prism host** and connect every laptop/phone
to the same phone hotspot. The extension UI stays local on each teammate's
machine; they all hit the **same shared backend** on the host.

```
Each teammate's local Chrome extension
                  ↓
       http://<HOST_HOTSPOT_IP>:8787/api
                  ↓
         Host laptop — Prism backend (prism-web)
```

This is better than each person running their own server: sessions, the answer
gate, and saved plans live in one place.

## 1. Everyone joins the same hotspot

```
iPhone / Android hotspot
├── Host MacBook running Prism (prism-web)
├── Teammate laptop (Prism extension → host IP)
├── Teammate laptop (Prism extension → host IP)
└── Phones for testing (open host IP in browser)
```

## 2. Host Prism on one laptop

From the `Prism` repo root:

```bash
npm run build -w prism-web
npm run dev            # binds 0.0.0.0 and prints your LAN URL
```

`npm run dev` runs `HOST=0.0.0.0 PORT=8787 node apps/web/dist/server.js`.
On start it prints something like:

```
Prism web server running
  local:            http://localhost:8787
  on your network:  http://172.20.10.2:8787
  → share a network URL with teammates on the same hotspot.
```

To restrict to the host only (no LAN): `HOST=127.0.0.1 npm run dev`.

## 3. Find the host laptop's hotspot IP (if needed)

On the host Mac:

```bash
ipconfig getifaddr en0      # typically returns 172.20.10.x on an iPhone hotspot
```

Use that IP (not `localhost`) for teammates.

## 4. Teammates connect

- **Browser only:** open `http://172.20.10.2:8787` (replace with host IP). The
  demo UI uses relative `/api/...` paths, so it just works against the host.
- **Chrome extension:** each teammate loads the unpacked extension, opens the
  Prism side panel, and in the **Backend host** field pastes the host URL
  (`http://172.20.10.2:8787`), then clicks **Save host**. Their local extension
  now calls the shared backend.

> Do **not** leave the extension host at `http://localhost:8787` on a teammate's
> machine — `localhost` points to *their* computer, not the host.

## 5. If the hotspot blocks laptop-to-laptop traffic

Some phone hotspots isolate clients from each other. Test from a teammate's
laptop:

```bash
ping 172.20.10.2
```

If pings/requests fail, try a phone with "Local-only hotspot" (Android) or tether
via the host Mac's own Wi-Fi/Bluetooth PAN instead. Behavior varies by carrier
and device manufacturer.

## Notes

- `prism-web` is a zero-dependency Node HTTP server (not Next.js). The port is
  `8787`, not `3000`.
- The answer gate is enforced server-side, so it works identically whether a
  learner uses the browser UI or the extension against the shared host.
