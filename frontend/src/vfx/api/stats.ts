import { apiGet } from "./client";
import type { DashboardSummary } from "../types";

export const fetchSummary = () => apiGet<DashboardSummary>("/stats/summary");
