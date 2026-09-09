import { SessionUtils } from "./conversations";

const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock crypto.randomUUID for test environment
let uuidCounter = 0;
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: jest.fn(() => `test-uuid-${++uuidCounter}`),
  },
  writable: true,
});

describe("SessionUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
  });

  describe("saveCurrentSessionId", () => {
    test("saves session ID to localStorage", () => {
      SessionUtils.saveCurrentSessionId("test-session-id");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "chat-playground-current-session",
        "test-session-id"
      );
    });
  });

  describe("createDefaultSession", () => {
    test("creates default session with agent ID", () => {
      const result = SessionUtils.createDefaultSession("agent_123");

      expect(result).toEqual(
        expect.objectContaining({
          name: "Default Session",
          messages: [],
          selectedModel: "",
          systemMessage: "You are a helpful assistant.",
          agentId: "agent_123",
        })
      );
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    test("creates default session with inherited model", () => {
      const result = SessionUtils.createDefaultSession(
        "agent_123",
        "inherited-model"
      );

      expect(result.selectedModel).toBe("inherited-model");
      expect(result.agentId).toBe("agent_123");
    });

    test("creates unique session IDs", () => {
      const originalNow = Date.now;
      let mockTime = 1710005000;
      Date.now = jest.fn(() => ++mockTime);

      const session1 = SessionUtils.createDefaultSession("agent_123");
      const session2 = SessionUtils.createDefaultSession("agent_123");

      expect(session1.id).not.toBe(session2.id);

      Date.now = originalNow;
    });

    test("sets creation and update timestamps", () => {
      const result = SessionUtils.createDefaultSession("agent_123");

      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
      expect(typeof result.createdAt).toBe("number");
      expect(typeof result.updatedAt).toBe("number");
    });
  });
});

test("retains saved local sessions beyond the former cache lifetime", () => {
  localStorageMock.getItem.mockReturnValue(
    JSON.stringify({
      ...SessionUtils.createDefaultSession("chat-one", "model-1"),
      id: "session-one",
      cachedAt: Date.now() - 2 * 60 * 60 * 1000,
      responseId: "response-one",
    })
  );
  expect(
    SessionUtils.loadSessionData("chat-one", "session-one")?.responseId
  ).toBe("response-one");
});
