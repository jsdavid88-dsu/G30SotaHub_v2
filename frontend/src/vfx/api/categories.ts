import { apiGet } from "./client";
import type { Category } from "../types";

export const fetchCategories = () => apiGet<Category[]>("/categories");
export const fetchCategory = (slug: string) => apiGet<Category>(`/categories/${slug}`);
