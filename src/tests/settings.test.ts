import { describe, expect, it } from "vitest";

import { AudioManager } from "../audio/AudioManager";
import { DEFAULT_GAME_SETTINGS, SettingsStore } from "../ui/SettingsStore";

class MemoryStorage {
  private readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("local settings persistence", () => {
  it("persists and sanitizes game settings without relying on browser globals", () => {
    const storage = new MemoryStorage();
    const first = new SettingsStore({ storage, storageKey: "game-settings" });
    first.update({ musicVolume: 0.31, renderScale: 1.2, aspectMode: "4:3", invertCameraY: true });

    const restored = new SettingsStore({ storage, storageKey: "game-settings" });
    expect(restored.settings).toMatchObject({
      musicVolume: 0.31,
      renderScale: 1.2,
      aspectMode: "4:3",
      invertCameraY: true
    });

    storage.setItem(
      "game-settings",
      JSON.stringify({ musicVolume: 9, renderScale: -1, aspectMode: "invalid" })
    );
    const sanitized = new SettingsStore({ storage, storageKey: "game-settings" });
    expect(sanitized.settings.musicVolume).toBe(1);
    expect(sanitized.settings.renderScale).toBe(0.5);
    expect(sanitized.settings.aspectMode).toBe(DEFAULT_GAME_SETTINGS.aspectMode);
  });

  it("clears persisted game settings on reset", () => {
    const storage = new MemoryStorage();
    const settings = new SettingsStore({ storage, storageKey: "reset-game" });
    settings.update({ sfxVolume: 0.12 });
    settings.reset();
    expect(storage.getItem("reset-game")).toBeNull();
    expect(settings.settings.sfxVolume).toBe(DEFAULT_GAME_SETTINGS.sfxVolume);
  });

  it("persists audio bus settings before any audio context is unlocked", () => {
    const storage = new MemoryStorage();
    const first = new AudioManager({ storage, storageKey: "audio-settings" });
    first.setSettings({ master: 0.4, music: 0.22, muted: true });

    const restored = new AudioManager({ storage, storageKey: "audio-settings" });
    expect(restored.getSettings()).toMatchObject({ master: 0.4, music: 0.22, muted: true });
  });
});
