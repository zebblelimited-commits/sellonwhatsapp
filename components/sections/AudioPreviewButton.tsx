"use client";

import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { FastForward, Loader2, Music2, Pause, Play, Rewind, X } from "lucide-react";

let activePreviewAudio: HTMLAudioElement | null = null;
let stopActivePreview: (() => void) | null = null;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clearMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto", "stop"] as MediaSessionAction[]) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Unsupported media actions are optional browser capabilities.
    }
  }
}

type AudioPreviewButtonProps = {
  url: string;
  imageUrl?: string;
  title?: string;
  artist?: string;
  className?: string;
};

/**
 * Compact product-card trigger with one shared bottom-sheet playback surface.
 * The audio element remains local to the selected product, while the sheet
 * owns the visible controls and media-session metadata.
 */
export default function AudioPreviewButton({
  url,
  imageUrl,
  title = "Audio Preview",
  artist = "SellOnWhatsApp",
  className,
}: AudioPreviewButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  const closePlayer = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setLoading(false);
    setCurrentTime(0);
    setIsOpen(false);
    if (activePreviewAudio === audio) {
      activePreviewAudio = null;
      stopActivePreview = null;
      clearMediaSession();
    }
  };

  useEffect(() => {
    return () => {
      if (activePreviewAudio === audioRef.current) closePlayer();
      else audioRef.current?.pause();
    };
  }, []);

  const updateMediaSession = (audio: HTMLAudioElement) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: "SellOnWhatsApp Audio Preview",
      artwork: imageUrl?.trim() ? [{ src: imageUrl.trim(), sizes: "512x512", type: "image/jpeg" }] : [],
    });

    try {
      navigator.mediaSession.setActionHandler("play", () => { void audio.play(); });
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
      });
      navigator.mediaSession.setActionHandler("stop", closePlayer);
    } catch {
      // Media-session controls are optional and browser-dependent.
    }
  };

  const playAudio = async (audio: HTMLAudioElement) => {
    setError(false);
    setLoading(true);
    try {
      await audio.play();
    } catch {
      setError(true);
      closePlayer();
    } finally {
      setLoading(false);
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      return;
    }
    await playAudio(audio);
  };

  const handleTrigger = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const audio = audioRef.current;
    if (!audio) return;

    if (!isOpen) {
      stopActivePreview?.();
      activePreviewAudio = audio;
      stopActivePreview = closePlayer;
      setIsOpen(true);
      updateMediaSession(audio);
    }

    await togglePlayback();
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.currentTarget.value);
    setCurrentTime(nextTime);
    if (audioRef.current) audioRef.current.currentTime = nextTime;
  };

  const nudgePlayback = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds));
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="sr-only"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
          if (activePreviewAudio === audioRef.current) {
            activePreviewAudio = null;
            stopActivePreview = null;
            clearMediaSession();
          }
        }}
        onError={() => setError(true)}
      />

      <button
        type="button"
        onClick={handleTrigger}
        className={className || "absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 active:scale-95"}
        aria-label={playing ? `Pause preview of ${title}` : `Play preview of ${title}`}
        title={error ? "This audio preview could not be loaded" : undefined}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        <span>{error ? "Preview unavailable" : playing ? "Pause preview" : "Preview"}</span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close audio preview"
            onClick={closePlayer}
            className="fixed inset-0 z-[90] cursor-default bg-black/25 backdrop-blur-[2px]"
          />
          <section
            role="dialog"
            aria-label={`${title} audio preview`}
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[91] mx-auto w-full max-w-2xl rounded-t-2xl border border-gray-200 bg-white p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.18)] sm:bottom-4 sm:rounded-2xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <Music2 className="m-3 text-emerald-600" size={24} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-gray-900">{title}</p>
                <p className="truncate text-xs font-medium text-gray-500">{artist} · Audio preview</p>
              </div>
              <button type="button" onClick={closePlayer} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Close player">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold tabular-nums text-gray-500">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={handleSeek}
                disabled={!duration}
                aria-label="Audio preview progress"
                className="h-1.5 flex-1 accent-[#00a63e]"
              />
              <span>{formatTime(duration)}</span>
            </div>

            <div className="mt-3 flex items-center justify-center gap-5">
              <button type="button" onClick={() => nudgePlayback(-10)} className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100" aria-label="Seek backward 10 seconds">
                <Rewind size={18} />
              </button>
              <button
                type="button"
                onClick={() => void togglePlayback()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a63e] text-white shadow-md transition hover:bg-[#008f36] active:scale-95"
                aria-label={playing ? "Pause audio preview" : "Play audio preview"}
              >
                {loading ? <Loader2 size={19} className="animate-spin" /> : playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              </button>
              <button type="button" onClick={() => nudgePlayback(10)} className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100" aria-label="Seek forward 10 seconds">
                <FastForward size={18} />
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
