import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import ChatPlaygroundPage from "./page";
import {
  SessionUtils,
  type ChatAgent,
} from "@/components/chat-playground/conversations";
import type { Message } from "@/components/chat-playground/chat-message";

const mockClient = {
  apiKey: "test-token",
  models: { list: jest.fn() },
  vectorStores: { list: jest.fn(), files: { create: jest.fn() } },
  files: { create: jest.fn() },
};
jest.mock("@/hooks/use-auth-client", () => ({
  useAuthClient: () => mockClient,
}));
jest.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
    disabled,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <select
      value={value}
      onChange={event => onValueChange(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
}));
jest.mock("@/components/chat-playground/chat", () => ({
  Chat: ({
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isGenerating,
    onRAGFileUpload,
  }: {
    messages: Message[];
    input: string;
    handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: () => Promise<void>;
    isGenerating: boolean;
    onRAGFileUpload: (file: File) => Promise<void>;
  }) => (
    <div>
      {messages.map(message => (
        <p key={message.id}>{message.content}</p>
      ))}
      <input
        aria-label="Chat input"
        value={input}
        onChange={handleInputChange}
      />
      <button onClick={() => void handleSubmit()} disabled={isGenerating}>
        Send
      </button>
      <button
        onClick={() =>
          void onRAGFileUpload(
            new File(["hello"], "notes.txt", { type: "text/plain" })
          )
        }
      >
        Upload file
      </button>
    </div>
  ),
}));

const agents: ChatAgent[] = [
  {
    agent_id: "chat-one",
    agent_config: {
      name: "Agent One",
      instructions: "Be concise.",
      model: "model-1",
      toolgroups: [
        { name: "builtin::file_search", args: { vector_db_ids: ["vs_1"] } },
      ],
    },
  },
  {
    agent_id: "chat-two",
    agent_config: {
      name: "Agent Two",
      instructions: "Explain carefully.",
      model: "model-1",
    },
  },
];
const mockFetch = jest.fn();

function streamResponse(id: string, text: string) {
  const events = [
    { type: "response.created", response: { id } },
    { type: "response.output_text.delta", delta: text },
    { type: "response.completed", response: { id } },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(events),
          })
          .mockResolvedValueOnce({ done: true }),
      }),
    },
  };
}

async function ready() {
  await waitFor(() =>
    expect(screen.getByDisplayValue("model-1")).toBeInTheDocument()
  );
}
async function send(text: string) {
  fireEvent.change(screen.getByLabelText("Chat input"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByText("Send"));
  await waitFor(() => expect(screen.getByText("Send")).toBeEnabled());
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  SessionUtils.saveAgentsList(agents);
  SessionUtils.saveCurrentAgentId("chat-one");
  mockClient.models.list.mockResolvedValue({
    data: [{ id: "model-1", custom_metadata: { model_type: "llm" } }],
  });
  mockClient.vectorStores.list.mockResolvedValue({
    data: [{ id: "vs_1", name: "Documents", metadata: {} }],
  });
  mockClient.files.create.mockResolvedValue({ id: "file_1" });
  mockClient.vectorStores.files.create.mockResolvedValue({
    id: "file_1",
    status: "completed",
  });
  mockFetch.mockReset();
  global.fetch = mockFetch;
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test("loads persisted chats without the removed Agents API", async () => {
  render(<ChatPlaygroundPage />);
  await ready();
  expect(screen.getByDisplayValue("Agent One")).toBeInTheDocument();
  expect(screen.getByText("Be concise.")).toBeInTheDocument();
  expect(mockFetch).not.toHaveBeenCalled();
});

test("creates a local chat and persists its selected model and instructions", async () => {
  render(<ChatPlaygroundPage />);
  await ready();
  fireEvent.click(screen.getByText("+ New Agent"));
  fireEvent.change(screen.getByPlaceholderText("My Custom Agent"), {
    target: { value: "New Analyst" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("You are a helpful assistant."),
    { target: { value: "Summarize reports." } }
  );
  fireEvent.click(screen.getByText("Create Agent"));
  await waitFor(() =>
    expect(screen.getByDisplayValue("New Analyst")).toBeInTheDocument()
  );
  const created = SessionUtils.loadAgentsList().find(
    agent => agent.agent_config?.name === "New Analyst"
  );
  expect(created?.agent_config).toMatchObject({
    model: "model-1",
    instructions: "Summarize reports.",
  });
  expect(SessionUtils.loadCurrentAgentId()).toBe(created?.agent_id);
});

test("streams Responses with configured file search and persists conversation continuity", async () => {
  mockFetch
    .mockResolvedValueOnce(streamResponse("resp_1", "First answer"))
    .mockResolvedValueOnce(streamResponse("resp_2", "Second answer"));
  render(<ChatPlaygroundPage />);
  await ready();
  await send("First question");
  expect(await screen.findByText("First answer")).toBeInTheDocument();
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
    model: "model-1",
    input: "First question",
    instructions: "Be concise.",
    stream: true,
    tools: [{ type: "file_search", vector_store_ids: ["vs_1"] }],
  });
  await send("Follow up");
  expect(JSON.parse(mockFetch.mock.calls[1][1].body).previous_response_id).toBe(
    "resp_1"
  );
  const id = SessionUtils.loadActiveSessionId("chat-one")!;
  expect(SessionUtils.loadSessionData("chat-one", id)?.responseId).toBe(
    "resp_2"
  );
});

test("clearing chat also clears the previous response ID", async () => {
  mockFetch
    .mockResolvedValueOnce(streamResponse("resp_1", "First answer"))
    .mockResolvedValueOnce(streamResponse("resp_2", "Fresh answer"));
  render(<ChatPlaygroundPage />);
  await ready();
  await send("First question");
  fireEvent.click(screen.getByText("Clear Chat"));
  expect(screen.queryByText("First answer")).not.toBeInTheDocument();
  await send("Fresh question");
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty(
    "previous_response_id"
  );
});

test("switching chats restores that chat's saved response ID", async () => {
  const second = {
    ...SessionUtils.createDefaultSession("chat-two", "model-1"),
    responseId: "saved_response",
  };
  SessionUtils.saveSessionData("chat-two", second);
  SessionUtils.saveActiveSessionId("chat-two", second.id);
  mockFetch.mockResolvedValueOnce(streamResponse("resp_new", "Continued"));
  render(<ChatPlaygroundPage />);
  await ready();
  fireEvent.change(screen.getByDisplayValue("Agent One"), {
    target: { value: "chat-two" },
  });
  await send("Continue this chat");
  expect(JSON.parse(mockFetch.mock.calls[0][1].body).previous_response_id).toBe(
    "saved_response"
  );
});

test("deleting a chat updates persistence and selects the remaining chat", async () => {
  render(<ChatPlaygroundPage />);
  await ready();
  fireEvent.click(screen.getByTitle("Delete current agent"));
  expect(screen.getByDisplayValue("Agent Two")).toBeInTheDocument();
  expect(SessionUtils.loadAgentsList().map(agent => agent.agent_id)).toEqual([
    "chat-two",
  ]);
  expect(SessionUtils.loadCurrentAgentId()).toBe("chat-two");
  expect(mockFetch).not.toHaveBeenCalled();
});

test("uploads a file and attaches it to the configured vector store", async () => {
  render(<ChatPlaygroundPage />);
  await ready();
  fireEvent.click(screen.getByText("Upload file"));
  await waitFor(() =>
    expect(mockClient.vectorStores.files.create).toHaveBeenCalledWith("vs_1", {
      file_id: "file_1",
    })
  );
  expect(mockClient.files.create).toHaveBeenCalledWith({
    file: expect.any(File),
    purpose: "assistants",
  });
});

test("surfaces HTTP failures from the Responses API", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 403,
    text: async () => "Access denied",
  });
  render(<ChatPlaygroundPage />);
  await ready();
  await send("Question");
  expect(
    screen.getByText("Failed to get response: 403 Access denied")
  ).toBeInTheDocument();
  errorLog.mockRestore();
});

test("restores legacy chat settings and transcript when no response ID was saved", async () => {
  localStorage.setItem(
    "chat-playground-session-data-chat-one-legacy",
    JSON.stringify({
      id: "legacy",
      agentId: "chat-one",
      name: "Agent One",
      cachedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: "old-user",
          role: "user",
          content: "Old question",
          createdAt: new Date().toISOString(),
        },
        {
          id: "old-answer",
          role: "assistant",
          content: "Old answer",
          createdAt: new Date().toISOString(),
        },
      ],
    })
  );
  SessionUtils.saveActiveSessionId("chat-one", "legacy");
  mockFetch.mockResolvedValueOnce(
    streamResponse("resp_migrated", "Continued answer")
  );
  render(<ChatPlaygroundPage />);
  await ready();
  await send("Follow up");
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
    model: "model-1",
    instructions: "Be concise.",
    input: [
      { role: "user", content: "Old question" },
      { role: "assistant", content: "Old answer" },
      { role: "user", content: "Follow up" },
    ],
  });
});
