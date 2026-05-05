import { apiGet, apiPost } from "./client";

export type Submission = {
  id: number;
  submitted_by: string | null;
  input_type: "url" | "keyword";
  input_value: string;
  status: "pending" | "processing" | "done" | "rejected";
  reject_reason: string | null;
  result_item_id: number | null;
  created_at: string;
  processed_at: string | null;
};

export type SubmissionStats = {
  pending: number;
  processing: number;
  done: number;
  rejected: number;
};

export const fetchSubmissions = (status?: string) => {
  const q = status ? `?status=${status}` : "";
  return apiGet<Submission[]>(`/submissions${q}`);
};

export const fetchSubmissionStats = () =>
  apiGet<SubmissionStats>("/submissions/stats");

export const createSubmission = (data: {
  input_type: "url" | "keyword";
  input_value: string;
  submitted_by?: string;
}) => apiPost<Submission>("/submissions", data);
