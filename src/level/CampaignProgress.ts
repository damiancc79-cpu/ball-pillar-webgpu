import { CAMPAIGN_LEVELS } from "./LevelCatalog";
import type { LevelDefinition } from "./LevelDefinition";

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CampaignProgressSnapshot {
  completedLevelIds: readonly string[];
  unlockedLevelIds: readonly string[];
}

export interface CampaignProgressOptions {
  storage?: CampaignStorage;
  storageKey?: string;
  levels?: readonly LevelDefinition[];
  autoLoad?: boolean;
}

export const CAMPAIGN_PROGRESS_STORAGE_KEY = "ball-pillar-webgpu.campaign.v1";

function getBrowserStorage(): CampaignStorage | undefined {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // The campaign still works for this session when storage is unavailable.
  }
  return undefined;
}

function completedIdsFrom(value: unknown, allowedIds: ReadonlySet<string>): Set<string> {
  if (typeof value !== "object" || value === null || !("completedLevelIds" in value)) {
    return new Set();
  }
  const ids = (value as { completedLevelIds?: unknown }).completedLevelIds;
  if (!Array.isArray(ids)) {
    return new Set();
  }
  return new Set(ids.filter((id): id is string => typeof id === "string" && allowedIds.has(id)));
}

/**
 * Small, versioned campaign save. A course only becomes selectable after all
 * earlier courses are clear, so PILLAR WORKS remains the actual finale.
 */
export class CampaignProgress {
  private readonly storage?: CampaignStorage;
  private readonly storageKey: string;
  private readonly levels: readonly LevelDefinition[];
  private completedLevelIds = new Set<string>();

  public constructor(options: CampaignProgressOptions = {}) {
    this.storage = options.storage ?? getBrowserStorage();
    this.storageKey = options.storageKey ?? CAMPAIGN_PROGRESS_STORAGE_KEY;
    this.levels = options.levels ?? CAMPAIGN_LEVELS;
    if (options.autoLoad ?? true) {
      this.load();
    }
  }

  public get snapshot(): CampaignProgressSnapshot {
    return {
      completedLevelIds: this.levels
        .filter((level) => this.completedLevelIds.has(level.id))
        .map((level) => level.id),
      unlockedLevelIds: this.levels.filter((level) => this.isUnlocked(level.id)).map((level) => level.id)
    };
  }

  public isCompleted(levelId: string): boolean {
    return this.completedLevelIds.has(levelId);
  }

  public isUnlocked(levelId: string): boolean {
    const index = this.levels.findIndex((level) => level.id === levelId);
    return index >= 0 && this.levels.slice(0, index).every((level) => this.completedLevelIds.has(level.id));
  }

  /** Marks a cleared course and returns the newly available next course, if any. */
  public complete(levelId: string): LevelDefinition | undefined {
    if (!this.levels.some((level) => level.id === levelId)) {
      return undefined;
    }
    this.completedLevelIds.add(levelId);
    this.persist();
    const index = this.levels.findIndex((level) => level.id === levelId);
    return this.levels[index + 1];
  }

  public load(): CampaignProgressSnapshot {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) {
        const allowedIds = new Set(this.levels.map((level) => level.id));
        this.completedLevelIds = completedIdsFrom(JSON.parse(raw), allowedIds);
      }
    } catch {
      // Ignore malformed or inaccessible local storage.
    }
    return this.snapshot;
  }

  public reset(): CampaignProgressSnapshot {
    this.completedLevelIds.clear();
    try {
      this.storage?.removeItem?.(this.storageKey);
    } catch {
      // Keep the in-memory campaign reset if storage rejects the operation.
    }
    return this.snapshot;
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        this.storageKey,
        JSON.stringify({ completedLevelIds: this.snapshot.completedLevelIds })
      );
    } catch {
      // A failed write must not prevent unlocking the next course this session.
    }
  }
}
