import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { VectorDBCreator } from "./vector-db-creator";

const mockClient = {
  providers: { list: jest.fn() },
  vectorStores: { create: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.providers.list.mockResolvedValue([
    { api: "vector_io", provider_id: "faiss", provider_type: "inline::faiss" },
  ]);
  mockClient.vectorStores.create.mockResolvedValue({ id: "vs_created" });
});

test("creates a vector store using the release model metadata and returns its server ID", async () => {
  const created = jest.fn();
  render(
    <VectorDBCreator
      models={[
        {
          id: "embed-1",
          custom_metadata: {
            model_type: "embedding",
            embedding_dimension: 768,
          },
        },
      ]}
      onVectorDBCreated={created}
    />
  );
  await waitFor(() => expect(mockClient.providers.list).toHaveBeenCalled());
  fireEvent.change(screen.getByPlaceholderText("My Vector Database"), {
    target: { value: "Documents" },
  });
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "embed-1" },
  });
  fireEvent.click(screen.getByText("Create Vector DB"));
  await waitFor(() => expect(created).toHaveBeenCalledWith("vs_created"));
  expect(mockClient.vectorStores.create).toHaveBeenCalledWith({
    name: "Documents",
    embedding_model: "embed-1",
    embedding_dimension: 768,
    provider_id: "faiss",
  });
});

test("reports missing embedding dimensions without creating a vector store", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  render(
    <VectorDBCreator
      models={[{ id: "embed-1", custom_metadata: { model_type: "embedding" } }]}
    />
  );
  fireEvent.change(screen.getByPlaceholderText("My Vector Database"), {
    target: { value: "Documents" },
  });
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "embed-1" },
  });
  fireEvent.click(screen.getByText("Create Vector DB"));
  expect(
    await screen.findByText(
      "Embedding dimension not available for selected model"
    )
  ).toBeInTheDocument();
  expect(mockClient.vectorStores.create).not.toHaveBeenCalled();
  errorLog.mockRestore();
});
