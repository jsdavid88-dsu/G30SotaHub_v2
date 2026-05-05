import { apiGet } from "./client";
import type { Item } from "../types";

export const searchItems = (q: string, limit = 50) =>
  apiGet<Item[]>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
