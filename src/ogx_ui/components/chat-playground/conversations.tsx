"use client";

import type { Message } from "@/components/chat-playground/chat-message";

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  selectedModel: string;
  systemMessage: string;
  agentId: string;
  responseId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatAgent {
  agent_id: string;
  agent_config?: {
    name?: string;
    agent_name?: string;
    instructions?: string;
    model?: string;
    toolgroups?: Array<
      string | { name: string; args: Record<string, unknown> }
    >;
  };
}

const CURRENT_SESSION_KEY = "chat-playground-current-session";

// ensures this only happens client side
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.error("Error accessing localStorage:", err);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.error("Error writing to localStorage:", err);
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error("Error removing from localStorage:", err);
    }
  },
};

const generateSessionId = (): string => {
  return globalThis.crypto.randomUUID();
};

export const SessionUtils = {
  loadCurrentSessionId: (agentId?: string): string | null => {
    const key = agentId
      ? `${CURRENT_SESSION_KEY}-${agentId}`
      : CURRENT_SESSION_KEY;
    return safeLocalStorage.getItem(key);
  },

  saveCurrentSessionId: (sessionId: string, agentId?: string) => {
    const key = agentId
      ? `${CURRENT_SESSION_KEY}-${agentId}`
      : CURRENT_SESSION_KEY;
    safeLocalStorage.setItem(key, sessionId);
  },

  createDefaultSession: (
    agentId: string,
    inheritModel?: string
  ): ChatSession => ({
    id: generateSessionId(),
    name: "Default Session",
    messages: [],
    selectedModel: inheritModel || "",
    systemMessage: "You are a helpful assistant.",
    agentId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),

  clearCurrentSession: (agentId?: string) => {
    const key = agentId
      ? `${CURRENT_SESSION_KEY}-${agentId}`
      : CURRENT_SESSION_KEY;
    safeLocalStorage.removeItem(key);
  },

  loadCurrentAgentId: (): string | null => {
    return safeLocalStorage.getItem("chat-playground-current-agent");
  },

  saveCurrentAgentId: (agentId: string) => {
    safeLocalStorage.setItem("chat-playground-current-agent", agentId);
  },

  // Comprehensive session caching
  saveSessionData: (agentId: string, sessionData: ChatSession) => {
    const key = `chat-playground-session-data-${agentId}-${sessionData.id}`;
    safeLocalStorage.setItem(
      key,
      JSON.stringify({
        ...sessionData,
        cachedAt: Date.now(),
      })
    );
  },

  loadSessionData: (agentId: string, sessionId: string): ChatSession | null => {
    const key = `chat-playground-session-data-${agentId}-${sessionId}`;
    const cached = safeLocalStorage.getItem(key);
    if (!cached) return null;

    try {
      const data = JSON.parse(cached);
      // Convert date strings back to Date objects
      return {
        ...data,
        messages: data.messages.map(
          (msg: { createdAt: string; [key: string]: unknown }) => ({
            ...msg,
            createdAt: new Date(msg.createdAt),
          })
        ),
      };
    } catch (error) {
      console.error("Error parsing cached session data:", error);
      safeLocalStorage.removeItem(key);
      return null;
    }
  },

  // Agent config caching
  saveAgentConfig: (
    agentId: string,
    config: {
      toolgroups?: Array<
        string | { name: string; args: Record<string, unknown> }
      >;
      [key: string]: unknown;
    }
  ) => {
    const key = `chat-playground-agent-config-${agentId}`;
    safeLocalStorage.setItem(
      key,
      JSON.stringify({
        config,
        cachedAt: Date.now(),
      })
    );
  },

  loadAgentConfig: (
    agentId: string
  ): {
    toolgroups?: Array<
      string | { name: string; args: Record<string, unknown> }
    >;
    [key: string]: unknown;
  } | null => {
    const key = `chat-playground-agent-config-${agentId}`;
    const cached = safeLocalStorage.getItem(key);
    if (!cached) return null;

    try {
      const data = JSON.parse(cached);
      // Check if cache is fresh (less than 30 minutes old)
      const cacheAge = Date.now() - (data.cachedAt || 0);
      if (cacheAge > 30 * 60 * 1000) {
        safeLocalStorage.removeItem(key);
        return null;
      }
      return data.config;
    } catch (error) {
      console.error("Error parsing cached agent config:", error);
      safeLocalStorage.removeItem(key);
      return null;
    }
  },

  // Clear all cached data for an agent
  clearAgentCache: (agentId: string) => {
    const keys = Object.keys(localStorage).filter(
      key =>
        key.includes(`chat-playground-session-data-${agentId}`) ||
        key.includes(`chat-playground-agent-config-${agentId}`)
    );
    keys.forEach(key => safeLocalStorage.removeItem(key));
  },

  // Persist the local agents list (for responses-mode agents)
  saveAgentsList: (agents: ChatAgent[]) => {
    safeLocalStorage.setItem(
      "chat-playground-agents-list",
      JSON.stringify(agents)
    );
  },

  loadAgentsList: (): ChatAgent[] => {
    const cached = safeLocalStorage.getItem("chat-playground-agents-list");
    if (!cached) return [];
    try {
      return JSON.parse(cached);
    } catch {
      return [];
    }
  },

  // Save which session ID is active for a given agent
  saveActiveSessionId: (agentId: string, sessionId: string) => {
    safeLocalStorage.setItem(
      `chat-playground-active-session-${agentId}`,
      sessionId
    );
  },

  loadActiveSessionId: (agentId: string): string | null => {
    return safeLocalStorage.getItem(
      `chat-playground-active-session-${agentId}`
    );
  },
};
