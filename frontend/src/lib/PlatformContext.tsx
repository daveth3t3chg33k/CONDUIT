"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api, Platform } from "@/lib/api";

interface PlatformContextValue {
  platforms: Platform[];
  selectedPlatformId: string | null;
  selectedPlatform: Platform | null;
  loading: boolean;
  error: string | null;
  selectPlatform: (id: string) => void;
  refreshPlatforms: () => Promise<void>;
  createPlatform: (name: string) => Promise<Platform>;
  removePlatform: (id: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPlatforms = useCallback(async () => {
    try {
      setError(null);
      const list = await api.listPlatforms();
      setPlatforms(list);
      // Auto-select first platform if none selected
      if (!selectedPlatformId && list.length > 0) {
        setSelectedPlatformId(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load platforms");
    } finally {
      setLoading(false);
    }
  }, [selectedPlatformId]);

  useEffect(() => {
    refreshPlatforms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPlatform = useCallback((id: string) => {
    setSelectedPlatformId(id);
    localStorage.setItem("conduit_platform_id", id);
  }, []);

  // Restore last selected platform from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("conduit_platform_id");
    if (saved) setSelectedPlatformId(saved);
  }, []);

  const selectedPlatform = platforms.find(p => p.id === selectedPlatformId) || null;

  const createPlatform = useCallback(async (name: string): Promise<Platform> => {
    const platform = await api.createPlatform({ name });
    setPlatforms(prev => [platform, ...prev]);
    setSelectedPlatformId(platform.id);
    localStorage.setItem("conduit_platform_id", platform.id);
    return platform;
  }, []);

  const removePlatform = useCallback((id: string) => {
    setPlatforms(prev => prev.filter(p => p.id !== id));
    if (selectedPlatformId === id) {
      setSelectedPlatformId(null);
      localStorage.removeItem("conduit_platform_id");
    }
  }, [selectedPlatformId]);

  return (
    <PlatformContext.Provider value={{
      platforms,
      selectedPlatformId,
      selectedPlatform,
      loading,
      error,
      selectPlatform,
      refreshPlatforms,
      createPlatform,
      removePlatform,
    }}>
      {children}
    </PlatformContext.Provider>
  );
}
