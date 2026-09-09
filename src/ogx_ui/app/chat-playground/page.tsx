"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Chat } from "@/components/chat-playground/chat";
import { type Message } from "@/components/chat-playground/chat-message";
import { VectorDBCreator } from "@/components/chat-playground/vector-db-creator";
import { useAuthClient } from "@/hooks/use-auth-client";
import type { Model } from "ogx-client/resources/models";

// Extended Model type to include properties from API response
type ModelWithMetadata = Pick<Model, "id" | "custom_metadata"> & {
  id: string;
  custom_metadata?: {
    model_type?: string;
    [key: string]: unknown;
  };
};
import {
  SessionUtils,
  type ChatSession,
  type ChatAgent,
} from "@/components/chat-playground/conversations";
export default function ChatPlaygroundPage() {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(
    null
  );
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Pick<Model, "id" | "custom_metadata">[]>(
    []
  );
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [selectedAgentConfig, setSelectedAgentConfig] = useState<{
    toolgroups?: Array<
      string | { name: string; args: Record<string, unknown> }
    >;
  } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentInstructions, setNewAgentInstructions] = useState(
    "You are a helpful assistant."
  );
  const [selectedToolgroups, setSelectedToolgroups] = useState<string[]>([]);
  const availableToolgroups = [
    { identifier: "builtin::websearch", provider_id: "web_search" },
    { identifier: "builtin::file_search", provider_id: "file_search" },
  ];
  const [showCreateVectorDB, setShowCreateVectorDB] = useState(false);
  const [availableVectorDBs, setAvailableVectorDBs] = useState<
    Array<{
      identifier: string;
      vector_db_name?: string;
      embedding_model: string;
    }>
  >([]);
  const [uploadNotification, setUploadNotification] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "loading";
  }>({ show: false, message: "", type: "success" });
  const [selectedVectorDBs, setSelectedVectorDBs] = useState<string[]>([]);
  const client = useAuthClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastResponseIdRef = useRef<string | null>(null);

  const isModelsLoading = modelsLoading ?? true;

  const selectAgent = useCallback((agent: ChatAgent) => {
    abortControllerRef.current?.abort();
    const sessionId = SessionUtils.loadActiveSessionId(agent.agent_id);
    const cached = sessionId
      ? SessionUtils.loadSessionData(agent.agent_id, sessionId)
      : null;
    const session = cached || {
      ...SessionUtils.createDefaultSession(
        agent.agent_id,
        agent.agent_config?.model
      ),
      name:
        agent.agent_config?.name || agent.agent_config?.agent_name || "Chat",
      systemMessage:
        agent.agent_config?.instructions || "You are a helpful assistant.",
    };
    setSelectedAgentId(agent.agent_id);
    setCurrentSession(session);
    setSelectedAgentConfig({
      toolgroups: agent.agent_config?.toolgroups || [],
    });
    if (session.selectedModel) setSelectedModel(session.selectedModel);
    lastResponseIdRef.current = session.responseId || null;
    setError(null);
    SessionUtils.saveCurrentAgentId(agent.agent_id);
    SessionUtils.saveActiveSessionId(agent.agent_id, session.id);
  }, []);

  useEffect(() => {
    let savedAgents = SessionUtils.loadAgentsList();
    if (savedAgents.length === 0) {
      savedAgents = [
        {
          agent_id: `chat-${crypto.randomUUID()}`,
          agent_config: {
            name: "New Chat",
            instructions: "You are a helpful assistant.",
          },
        },
      ];
      SessionUtils.saveAgentsList(savedAgents);
    }
    setAgents(savedAgents);
    const savedId = SessionUtils.loadCurrentAgentId();
    selectAgent(
      savedAgents.find(agent => agent.agent_id === savedId) || savedAgents[0]
    );
    setAgentsLoading(false);
  }, [selectAgent]);

  const refreshVectorStores = useCallback(async () => {
    try {
      const stores = await client.vectorStores.list();
      setAvailableVectorDBs(
        stores.data.map(store => ({
          identifier: store.id,
          vector_db_name: store.name || store.id,
          embedding_model: String(store.metadata?.embedding_model || ""),
        }))
      );
    } catch (error) {
      console.error("Failed to load vector stores:", error);
    }
  }, [client]);

  useEffect(() => {
    void refreshVectorStores();
  }, [refreshVectorStores]);

  const createNewAgent = useCallback(
    async (
      name: string,
      instructions: string,
      model: string,
      toolgroups: string[] = [],
      vectorStoreIds: string[] = []
    ) => {
      const agent: ChatAgent = {
        agent_id: `chat-${crypto.randomUUID()}`,
        agent_config: {
          name: name || "New Chat",
          instructions,
          model,
          toolgroups: toolgroups.map(tool =>
            tool.includes("file_search")
              ? { name: tool, args: { vector_db_ids: vectorStoreIds } }
              : tool
          ),
        },
      };
      setAgents(previous => {
        const updated = [...previous, agent];
        SessionUtils.saveAgentsList(updated);
        return updated;
      });
      selectAgent(agent);
      return agent.agent_id;
    },
    [selectAgent]
  );

  const handleVectorDBCreated = useCallback(
    async (vectorStoreId: string) => {
      setShowCreateVectorDB(false);
      setSelectedVectorDBs(previous => [...previous, vectorStoreId]);
      await refreshVectorStores();
    },
    [refreshVectorStores]
  );

  const deleteAgent = useCallback(
    (agentId: string) => {
      if (
        !confirm(
          "Are you sure you want to delete this agent? This action cannot be undone and will delete the agent and all its sessions."
        )
      )
        return;
      const remaining = agents.filter(agent => agent.agent_id !== agentId);
      SessionUtils.clearAgentCache(agentId);
      SessionUtils.saveAgentsList(remaining);
      setAgents(remaining);
      if (selectedAgentId === agentId) {
        abortControllerRef.current?.abort();
        if (remaining.length > 0) selectAgent(remaining[0]);
        else {
          setSelectedAgentId("");
          setCurrentSession(null);
          setSelectedAgentConfig(null);
          lastResponseIdRef.current = null;
        }
      }
    },
    [agents, selectedAgentId, selectAgent]
  );

  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    setCurrentSession(prev =>
      prev
        ? {
            ...prev,
            selectedModel: newModel,
            updatedAt: Date.now(),
          }
        : prev
    );
  }, []);

  useEffect(() => {
    if (currentSession) {
      SessionUtils.saveCurrentSessionId(
        currentSession.id,
        currentSession.agentId
      );
      // cache session data
      SessionUtils.saveSessionData(currentSession.agentId, currentSession);
      // only update selectedModel if the session has a valid model and it's different from current
      if (
        currentSession.selectedModel &&
        currentSession.selectedModel !== selectedModel
      ) {
        setSelectedModel(currentSession.selectedModel);
      }
    }
  }, [currentSession, selectedModel]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setModelsLoading(true);
        setModelsError(null);
        const modelResponse = await client.models.list();
        const modelList = Array.isArray(modelResponse)
          ? modelResponse
          : "data" in modelResponse
            ? modelResponse.data
            : [];

        // store all models (including embedding models for vector DB creation)
        setModels(modelList);

        // set default LLM model for chat
        const llmModels = modelList.filter(
          (model): model is ModelWithMetadata =>
            (model as ModelWithMetadata).custom_metadata?.model_type === "llm"
        );
        if (llmModels.length > 0) {
          setSelectedModel(previous => previous || llmModels[0].id);
          setCurrentSession(previous =>
            previous && !previous.selectedModel
              ? { ...previous, selectedModel: llmModels[0].id }
              : previous
          );
        }
      } catch (err) {
        console.error("Error fetching models:", err);
        setModelsError("Failed to fetch available models");
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, [client, handleModelChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setCurrentSession(prev => {
      if (!prev) return prev;
      const updatedSession = {
        ...prev,
        messages: [...prev.messages, userMessage],
        updatedAt: Date.now(),
      };
      // update cache with new message
      SessionUtils.saveSessionData(prev.agentId, updatedSession);
      return updatedSession;
    });
    setInput("");

    await handleSubmitWithContent(userMessage.content);
  };

  const handleSubmitViaResponses = async (content: string) => {
    setIsGenerating(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      setCurrentSession(prev => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          messages: [...prev.messages, assistantMessage],
          updatedAt: Date.now(),
        };
        SessionUtils.saveSessionData(prev.agentId, updated);
        return updated;
      });

      const body: Record<string, unknown> = {
        model: selectedModel,
        input: content,
        stream: true,
      };
      if (lastResponseIdRef.current) {
        body.previous_response_id = lastResponseIdRef.current;
      }
      body.instructions =
        currentSession?.systemMessage || "You are a helpful assistant.";
      const tools: Record<string, unknown>[] = [];
      for (const tool of selectedAgentConfig?.toolgroups || []) {
        const toolId = typeof tool === "string" ? tool : tool.name;
        if (toolId === "web_search" || toolId.includes("websearch")) {
          tools.push({ type: "web_search" });
        } else if (toolId.includes("file_search") || toolId.includes("rag")) {
          tools.push({
            type: "file_search",
            vector_store_ids:
              typeof tool === "object" ? tool.args.vector_db_ids || [] : [],
          });
        }
      }
      if (tools.length) body.tools = tools;

      const res = await fetch("/api/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(client.apiKey
            ? { Authorization: `Bearer ${client.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to get response: ${res.status} ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            // Capture the response ID for conversation continuity
            if (event.response?.id) {
              lastResponseIdRef.current = event.response.id;
              setCurrentSession(previous =>
                previous
                  ? { ...previous, responseId: event.response.id }
                  : previous
              );
            }

            // Extract text from output_text.delta events
            if (event.type === "response.output_text.delta" && event.delta) {
              accumulatedText += event.delta;
              const textSnapshot = accumulatedText;
              flushSync(() => {
                setCurrentSession(prev => {
                  if (!prev) return prev;
                  const msgs = [...prev.messages];
                  const lastMsg = msgs[msgs.length - 1];
                  if (lastMsg?.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...lastMsg,
                      content: textSnapshot,
                    };
                  }
                  return { ...prev, messages: msgs, updatedAt: Date.now() };
                });
              });
            }

            // Handle completed response (non-streaming fallback)
            if (event.type === "response.completed" && event.response) {
              const resp = event.response;
              if (resp.id) lastResponseIdRef.current = resp.id;
              if (!accumulatedText && resp.output) {
                for (const item of resp.output) {
                  if (item.type === "message" && item.content) {
                    for (const block of item.content) {
                      if (block.type === "output_text" && block.text) {
                        accumulatedText += block.text;
                      }
                    }
                  }
                }
                if (accumulatedText) {
                  const finalText = accumulatedText;
                  setCurrentSession(prev => {
                    if (!prev) return prev;
                    const msgs = [...prev.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg?.role === "assistant") {
                      msgs[msgs.length - 1] = {
                        ...lastMsg,
                        content: finalText,
                      };
                    }
                    return { ...prev, messages: msgs, updatedAt: Date.now() };
                  });
                }
              }
            }
          } catch {
            // skip unparseable SSE lines
          }
        }
      }

      // Save session
      setCurrentSession(prev => {
        if (prev) SessionUtils.saveSessionData(prev.agentId, prev);
        return prev;
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Error in responses API:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmitWithContent = async (content: string) => {
    if (!currentSession) return;
    await handleSubmitViaResponses(content);
  };

  const suggestions = [
    "Write a Python function that prints 'Hello, World!'",
    "Explain step-by-step how to solve this math problem: If x² + 6x + 9 = 25, what is x?",
    "Design a simple algorithm to find the longest palindrome in a string.",
  ];

  const append = (message: { role: "user"; content: string }) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: message.role,
      content: message.content,
      createdAt: new Date(),
    };
    setCurrentSession(prev =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, newMessage],
            updatedAt: Date.now(),
          }
        : prev
    );
    handleSubmitWithContent(newMessage.content);
  };

  const clearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }

    lastResponseIdRef.current = null;
    setCurrentSession(prev =>
      prev
        ? {
            ...prev,
            messages: [],
            responseId: undefined,
            updatedAt: Date.now(),
          }
        : prev
    );
    setError(null);
  };

  const handleRAGFileUpload = async (file: File) => {
    if (!selectedAgentConfig?.toolgroups || !selectedAgentId) {
      setError("No agent selected or agent has no RAG tools configured");
      return;
    }

    // find RAG toolgroups that have vector_db_ids configured
    const ragToolgroups = selectedAgentConfig.toolgroups.filter(toolgroup => {
      if (
        typeof toolgroup === "object" &&
        (toolgroup.name?.includes("rag") ||
          toolgroup.name?.includes("file_search"))
      ) {
        return toolgroup.args && "vector_db_ids" in toolgroup.args;
      }
      return false;
    });

    if (ragToolgroups.length === 0) {
      setError("Current agent has no vector databases configured for RAG");
      return;
    }

    try {
      setError(null);
      console.log("Uploading file using RAG tool...");

      setUploadNotification({
        show: true,
        message: `📄 Uploading and indexing "${file.name}"...`,
        type: "loading",
      });

      const vectorDbIds = ragToolgroups.flatMap(toolgroup => {
        if (
          typeof toolgroup === "object" &&
          toolgroup.args &&
          "vector_db_ids" in toolgroup.args
        ) {
          return toolgroup.args.vector_db_ids as string[];
        }
        return [];
      });

      const uploaded = await client.files.create({
        file,
        purpose: "assistants",
      });
      for (const vectorStoreId of vectorDbIds) {
        const attached = await client.vectorStores.files.create(vectorStoreId, {
          file_id: uploaded.id,
        });
        if (attached.status === "failed")
          throw new Error("Failed to index uploaded file");
      }

      console.log("✅ File successfully uploaded using RAG tool");

      setUploadNotification({
        show: true,
        message: `📄 File "${file.name}" uploaded to the selected vector stores successfully!`,
        type: "success",
      });

      setTimeout(() => {
        setUploadNotification(prev => ({ ...prev, show: false }));
      }, 4000);
    } catch (err) {
      console.error("Error uploading file using RAG tool:", err);
      const errorMessage =
        err instanceof Error
          ? `Failed to upload file: ${err.message}`
          : "Failed to upload file using RAG tool";

      setUploadNotification({
        show: true,
        message: errorMessage,
        type: "error",
      });

      setTimeout(() => {
        setUploadNotification(prev => ({ ...prev, show: false }));
      }, 6000);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto">
      {/* Upload Notification */}
      {uploadNotification.show && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            uploadNotification.type === "success"
              ? "bg-green-100 border border-green-300 text-green-800"
              : uploadNotification.type === "error"
                ? "bg-red-100 border border-red-300 text-red-800"
                : "bg-blue-100 border border-blue-300 text-blue-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {uploadNotification.type === "loading" && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            )}
            <span className="text-sm font-medium">
              {uploadNotification.message}
            </span>
            {uploadNotification.type !== "loading" && (
              <button
                onClick={() =>
                  setUploadNotification(prev => ({ ...prev, show: false }))
                }
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Agent Session</h1>
          <div className="flex items-center gap-3">
            {!agentsLoading && agents.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Agent Session:</label>
                <Select
                  value={selectedAgentId}
                  onValueChange={agentId => {
                    const agent = agents.find(
                      item => item.agent_id === agentId
                    );
                    if (agent) selectAgent(agent);
                  }}
                  disabled={agentsLoading || isGenerating}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue
                      placeholder={
                        agentsLoading ? "Loading..." : "Select Agent Session"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(agent => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        {(() => {
                          if (
                            agent.agent_config &&
                            "name" in agent.agent_config &&
                            typeof agent.agent_config.name === "string"
                          ) {
                            return agent.agent_config.name;
                          }
                          if (
                            agent.agent_config &&
                            "agent_name" in agent.agent_config &&
                            typeof agent.agent_config.agent_name === "string"
                          ) {
                            return agent.agent_config.agent_name;
                          }
                          return `Agent ${agent.agent_id.slice(0, 8)}...`;
                        })()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAgentId && (
                  <Button
                    onClick={() => deleteAgent(selectedAgentId)}
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete current agent"
                    disabled={isGenerating}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            <Button
              onClick={() => setShowCreateAgent(true)}
              disabled={isGenerating}
              variant="outline"
              size="sm"
            >
              + New Agent
            </Button>
            {!agentsLoading && agents.length > 0 && (
              <Button
                variant="outline"
                onClick={clearChat}
                disabled={isGenerating}
              >
                Clear Chat
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Main Two-Column Layout */}
      <div className="flex flex-1 gap-6 min-h-0 flex-col lg:flex-row">
        {/* Left Column - Configuration Panel */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 space-y-6 p-4 border border-border rounded-lg bg-muted/30">
          <h2 className="text-lg font-semibold border-b pb-2 text-left">
            Settings
          </h2>

          {/* Model Configuration */}
          <div className="space-y-4 text-left">
            <h3 className="text-lg font-semibold border-b pb-2 text-left">
              Model Configuration
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2">Model</label>
                <Select
                  value={selectedModel}
                  onValueChange={handleModelChange}
                  disabled={isModelsLoading || isGenerating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        isModelsLoading ? "Loading..." : "Select Model"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {models
                      .filter(
                        (model): model is ModelWithMetadata =>
                          (model as ModelWithMetadata).custom_metadata
                            ?.model_type === "llm"
                      )
                      .map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {modelsError && (
                  <p className="text-destructive text-xs mt-1">{modelsError}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Agent Instructions
                </label>
                <div className="w-full h-24 px-3 py-2 text-sm border border-input rounded-md bg-muted text-muted-foreground">
                  {(selectedAgentId &&
                    agents.find(a => a.agent_id === selectedAgentId)
                      ?.agent_config?.instructions) ||
                    "No agent selected"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Instructions are set when creating an agent and cannot be
                  changed.
                </p>
              </div>
            </div>
          </div>

          {/* Agent Tools */}
          <div className="space-y-4 text-left">
            <h3 className="text-lg font-semibold border-b pb-2 text-left">
              Agent Tools
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2 text-muted-foreground">
                  Configured Tools
                </label>
                <div className="space-y-2">
                  {selectedAgentConfig?.toolgroups &&
                  selectedAgentConfig.toolgroups.length > 0 ? (
                    selectedAgentConfig.toolgroups.map(
                      (
                        toolgroup:
                          | string
                          | { name: string; args: Record<string, unknown> },
                        index: number
                      ) => {
                        const toolName =
                          typeof toolgroup === "string"
                            ? toolgroup
                            : toolgroup.name;
                        const toolArgs =
                          typeof toolgroup === "object" ? toolgroup.args : null;

                        const isRAGTool =
                          toolName.includes("rag") ||
                          toolName.includes("file_search");
                        const displayName = isRAGTool ? "RAG Search" : toolName;
                        const displayIcon = isRAGTool
                          ? "🔍"
                          : toolName.includes("search")
                            ? "🌐"
                            : "🔧";

                        return (
                          <div
                            key={index}
                            className="p-3 border border-input rounded-md bg-muted text-muted-foreground"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{displayIcon}</span>
                                <span className="text-sm font-medium text-primary">
                                  {displayName}
                                </span>
                              </div>
                            </div>
                            {isRAGTool && toolArgs && toolArgs.vector_db_ids ? (
                              <div className="mt-2 text-xs text-muted-foreground">
                                <span className="font-medium">
                                  Vector Databases:
                                </span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Array.isArray(toolArgs.vector_db_ids) ? (
                                    toolArgs.vector_db_ids.map(
                                      (dbId: string, idx: number) => (
                                        <code
                                          key={idx}
                                          className="px-1.5 py-0.5 bg-muted-foreground/10 rounded text-xs"
                                        >
                                          {dbId}
                                        </code>
                                      )
                                    )
                                  ) : (
                                    <code className="px-1.5 py-0.5 bg-muted-foreground/10 rounded text-xs">
                                      {String(toolArgs.vector_db_ids)}
                                    </code>
                                  )}
                                </div>
                              </div>
                            ) : null}
                            {!isRAGTool &&
                              toolArgs &&
                              Object.keys(toolArgs).length > 0 && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  <span className="font-medium">
                                    Configuration:
                                  </span>{" "}
                                  {Object.keys(toolArgs).length} parameter
                                  {Object.keys(toolArgs).length > 1 ? "s" : ""}
                                </div>
                              )}
                          </div>
                        );
                      }
                    )
                  ) : (
                    <div className="p-3 border border-input rounded-md bg-muted text-center">
                      <p className="text-sm text-muted-foreground">
                        No tools configured
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This agent only has text generation capabilities
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tools are configured when creating an agent and provide
                  additional capabilities like web search, math calculations, or
                  RAG document retrieval.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Chat Interface */}
        <div className="flex-1 flex flex-col min-h-0 p-4 border border-border rounded-lg bg-background">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {!agentsLoading && agents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="text-6xl mb-4">🦙</div>
                <h2 className="text-2xl font-semibold text-muted-foreground">
                  Create an Agent with OGX
                </h2>
                <p className="text-muted-foreground">
                  To get started, create your first agent. Each agent is
                  configured with specific instructions, models, and tools to
                  help you with different tasks.
                </p>
                <Button
                  onClick={() => setShowCreateAgent(true)}
                  disabled={isGenerating}
                  size="lg"
                  className="mt-4"
                >
                  Create Your First Agent
                </Button>
              </div>
            </div>
          ) : (
            <Chat
              className="flex-1"
              messages={currentSession?.messages || []}
              handleSubmit={handleSubmit}
              input={input}
              handleInputChange={handleInputChange}
              isGenerating={isGenerating}
              append={append}
              suggestions={suggestions}
              setMessages={messages =>
                setCurrentSession(prev =>
                  prev ? { ...prev, messages, updatedAt: Date.now() } : prev
                )
              }
              onRAGFileUpload={handleRAGFileUpload}
            />
          )}
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreateAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[500px] p-6 space-y-4">
            <h3 className="text-lg font-semibold">Create New Agent</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Agent Name (optional)
                </label>
                <Input
                  value={newAgentName}
                  onChange={e => setNewAgentName(e.target.value)}
                  placeholder="My Custom Agent"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Model</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models
                      .filter(
                        (model): model is ModelWithMetadata =>
                          (model as ModelWithMetadata).custom_metadata
                            ?.model_type === "llm"
                      )
                      .map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  System Instructions
                </label>
                <textarea
                  value={newAgentInstructions}
                  onChange={e => setNewAgentInstructions(e.target.value)}
                  placeholder="You are a helpful assistant."
                  className="w-full h-32 px-3 py-2 text-sm border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Tools (optional)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Available toolgroups: {availableToolgroups.length} found
                </p>
                <div className="space-y-2">
                  {availableToolgroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tools available
                    </p>
                  ) : (
                    availableToolgroups.map(toolgroup => (
                      <label
                        key={toolgroup.identifier}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={selectedToolgroups.includes(
                            toolgroup.identifier
                          )}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedToolgroups(prev => {
                                const newSelection = [
                                  ...prev,
                                  toolgroup.identifier,
                                ];
                                return newSelection;
                              });
                            } else {
                              setSelectedToolgroups(prev => {
                                const newSelection = prev.filter(
                                  id => id !== toolgroup.identifier
                                );
                                return newSelection;
                              });
                            }
                          }}
                          className="rounded border-input"
                        />
                        <span className="text-sm">
                          <code className="bg-muted px-1 rounded text-xs">
                            {toolgroup.identifier}
                          </code>
                          <span className="text-muted-foreground ml-2">
                            ({toolgroup.provider_id})
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedToolgroups.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No tools selected - agent will only have text generation
                    capabilities.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 border border-border rounded">
                  <strong>Note:</strong> Selected tools will be configured for
                  the agent. Some tools like RAG may require additional vector
                  DB configuration, and web search tools need API keys. Basic
                  text generation agents work without tools.
                </p>
              </div>

              {/* Vector DB Configuration for RAG */}
              {selectedToolgroups.includes("builtin::file_search") && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Vector Databases for RAG
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateVectorDB(true)}
                    >
                      + Create Vector DB
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {availableVectorDBs.length} available
                    </span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {availableVectorDBs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No vector databases available. Create one to use RAG
                        tools.
                      </p>
                    ) : (
                      availableVectorDBs.map(vectorDB => (
                        <label
                          key={vectorDB.identifier}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVectorDBs.includes(
                              vectorDB.identifier
                            )}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedVectorDBs(prev => [
                                  ...prev,
                                  vectorDB.identifier,
                                ]);
                              } else {
                                setSelectedVectorDBs(prev =>
                                  prev.filter(id => id !== vectorDB.identifier)
                                );
                              }
                            }}
                            className="rounded border-input"
                          />
                          <span className="text-sm">
                            <code className="bg-muted px-1 rounded text-xs">
                              {vectorDB.identifier}
                            </code>
                            {vectorDB.vector_db_name && (
                              <span className="text-muted-foreground ml-2">
                                ({vectorDB.vector_db_name})
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedVectorDBs.length === 0 &&
                    selectedToolgroups.includes("builtin::file_search") && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ⚠️ RAG tool selected but no vector databases chosen.
                        Create or select a vector database.
                      </p>
                    )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={async () => {
                  try {
                    await createNewAgent(
                      newAgentName,
                      newAgentInstructions,
                      selectedModel,
                      selectedToolgroups,
                      selectedVectorDBs
                    );
                    setShowCreateAgent(false);
                    setNewAgentName("");
                    setNewAgentInstructions("You are a helpful assistant.");
                    setSelectedToolgroups([]);
                    setSelectedVectorDBs([]);
                  } catch (error) {
                    console.error("Failed to create agent:", error);
                  }
                }}
                className="flex-1"
                disabled={!selectedModel || !newAgentInstructions.trim()}
              >
                Create Agent
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateAgent(false);
                  setNewAgentName("");
                  setNewAgentInstructions("You are a helpful assistant.");
                  setSelectedToolgroups([]);
                  setSelectedVectorDBs([]);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Create Vector DB Modal */}
      {showCreateVectorDB && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <VectorDBCreator
            models={models}
            onVectorDBCreated={handleVectorDBCreated}
            onCancel={() => setShowCreateVectorDB(false)}
          />
        </div>
      )}
    </div>
  );
}
