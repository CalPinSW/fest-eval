"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MusicKitInstance {
  authorize(): Promise<string>;
}
declare global {
  interface Window {
    MusicKit?: {
      configure(options: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance>;
    };
  }
}

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

function loadMusicKit(): Promise<NonNullable<Window["MusicKit"]>> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MUSICKIT_SRC;
    script.async = true;
    document.addEventListener("musickitloaded", () => (window.MusicKit ? resolve(window.MusicKit) : reject(new Error("MusicKit missing"))), { once: true });
    script.onerror = () => reject(new Error("Couldn't load Apple Music"));
    document.head.appendChild(script);
  });
}

/**
 * Apple Music has no OAuth redirect: MusicKit JS asks the user to authorise
 * in a popup and returns a Music-User-Token, which we send to the server.
 */
export function AppleMusicConnect() {
  const router = useRouter();
  const [status, setStatus] = useState<{ error?: string; busy?: boolean }>({});

  async function connect() {
    setStatus({ busy: true });
    try {
      const tokenResponse = await fetch("/api/connect/apple-music");
      if (!tokenResponse.ok) throw new Error((await tokenResponse.json()).error ?? "Apple Music is unavailable");
      const { developerToken } = await tokenResponse.json();
      const MusicKit = await loadMusicKit();
      const music = await MusicKit.configure({ developerToken, app: { name: "Clashplan", build: "1.0.0" } });
      const musicUserToken = await music.authorize();
      const saved = await fetch("/api/connect/apple-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicUserToken }),
      });
      if (!saved.ok) throw new Error((await saved.json()).error ?? "Couldn't connect");
      setStatus({});
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Couldn't connect" });
    }
  }

  return (
    <div>
      <button type="button" className="btn-primary" onClick={connect} disabled={status.busy}>
        {status.busy ? "Connecting…" : "Connect Apple Music"}
      </button>
      {status.error && <p role="alert" className="mt-2 text-sm text-danger">{status.error}</p>}
    </div>
  );
}
