import { axiosClient } from "./axiosClient";

export type RagDocumentStatus = "Draft" | "Processing" | "Indexed" | "Failed";

export type RagDocument = {
  id: number;
  title: string;
  description: string | null;
  fileName: string;
  s3Key: string;
  fileType: string;
  ragCategory: string | null;
  status: RagDocumentStatus;
  statusName: string;
  version: number;
  chunkCount: number;
  errorMessage: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string | null;
};

export type CreateRagDocumentUploadUrlPayload = {
  title: string;
  description: string | null;
  fileName: string;
  fileType: string;
  ragCategory: string | null;
};

export type UpdateRagDocumentMetadataPayload = {
  title: string;
  description: string;
  ragCategory: string;
};

export type CreateRagDocumentUploadUrlResponse = {
  documentId: number;
  s3Key: string;
  uploadUrl: string;
};

type ListResponse = RagDocument[] | { data?: RagDocument[] };

function unwrapDocuments(data: ListResponse) {
  if (Array.isArray(data)) {
    return data;
  }

  return Array.isArray(data.data) ? data.data : [];
}

async function listDocuments() {
  const response = await axiosClient.get<ListResponse>("/v1/rag-documents");

  return {
    ...response,
    data: unwrapDocuments(response.data),
  };
}

async function uploadFileToPresignedUrl(uploadUrl: string, fileUri: string, file?: Blob | null) {
  const body = file ?? (await (await fetch(fileUri)).blob());
  const response = await fetch(uploadUrl, {
    body,
    headers: {
      "Content-Type": "application/octet-stream",
    },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`Upload S3 thất bại (${response.status}).`);
  }
}

export const ragDocumentsApi = {
  list: listDocuments,
  get: (id: number) => axiosClient.get<RagDocument>(`/v1/rag-documents/${id}`),
  createUploadUrl: (payload: CreateRagDocumentUploadUrlPayload) =>
    axiosClient.post<CreateRagDocumentUploadUrlResponse>("/v1/rag-documents/upload-url", payload),
  confirm: (id: number) => axiosClient.post(`/v1/rag-documents/${id}/confirm`),
  reindex: (id: number) => axiosClient.post(`/v1/rag-documents/${id}/reindex`),
  updateMetadata: (id: number, payload: UpdateRagDocumentMetadataPayload) =>
    axiosClient.put(`/v1/rag-documents/${id}/metadata`, payload),
  remove: (id: number) => axiosClient.delete(`/v1/rag-documents/${id}`),
  uploadFileToPresignedUrl,
};
