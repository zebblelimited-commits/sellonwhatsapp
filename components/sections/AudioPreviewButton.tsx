"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Loader2, Music2, Pause, Play } from "lucide-react";

let activeAudio: HTMLAudioElement | null = null;
let stopActiveAudio: (() => void) | null = null;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

type AudioPreviewButtonProps = {
  url: string;
  imageUrl?: string;
  title?: string;
  artist?: string;
};

export default function AudioPreviewButton({ url, imageUrl, title = "Audio Preview", artist = "SellOnWhatsApp" }: AudioPreviewButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) audio.pause();
      if (activeAudio === audio) {
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.metadata = null;
          try {
            navigator.mediaSession.setActionHandler("play", null);
            navigator.mediaSession.setActionHandler("pause", null);
          } catch {
            // Some browsers do not allow clearing unsupported media actions.
          }
        }
        activeAudio = null;
        stopActiveAudio = null;
      }
    };
  }, []);

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  };

  const toggle = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const audio = audioRef.current;
    if (!audio) return;

    setError(false);
    if (playing) {
      stop();
      return;
    }

    stopActiveAudio?.();
    activeAudio = audio;
    stopActiveAudio = stop;
    if (typeof navigator !== "undefined" && "mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album: "SellOnWhatsApp Audio Preview",
        artwork: imageUrl?.trim() ? [{ src: imageUrl.trim(), sizes: "512x512" }] : [],
      });
      try {
        navigator.mediaSession.setActionHandler("play", () => { void audio.play(); });
        navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      } catch {
        // Media controls are optional and unsupported actions are ignored.
      }
    }
    setLoading(true);
    try {
      await audio.play();
    } catch {
      setError(true);
      if (activeAudio === audio) {
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null;
        activeAudio = null;
        stopActiveAudio = null;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
      aria-label={playing ? "Pause audio preview" : "Play audio preview"}
      title={error ? "This audio preview could not be loaded" : undefined}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="sr-only"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          stop();
          if (activeAudio === audioRef.current) {
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null;
            activeAudio = null;
            stopActiveAudio = null;
          }
        }}
        onError={() => setError(true)}
      />
      {loading ? <Loader2 size={12} className="animate-spin" /> : playing ? <Pause size={12} /> : <Play size={12} />}
      <Music2 size={12} />
      <span>{error ? "Preview unavailable" : loading ? "Loading preview" : playing ? "Pause preview" : "Play preview"}</span>
      {!error && (duration > 0 || currentTime > 0) && <span className="font-medium text-emerald-600">{formatTime(currentTime)} / {formatTime(duration)}</span>}
    </button>
  );
}
