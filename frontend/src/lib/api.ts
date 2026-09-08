import type { Analysis, Comparison, Settings } from "./types";
const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let session = sessionStorage.getItem("analyset-session");
if (!session) {
  session = crypto.randomUUID();
  sessionStorage.setItem("analyset-session", session);
}
async function request(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      ...init,
      headers: { "X-Session-ID": session!, ...init.headers },
    });
  } catch {
    throw new Error(
      "Cannot reach the analysis server. Check that the backend is running.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Request failed (${response.status}).`,
    );
  }
  return response;
}
export async function analyze(
  file: File,
  settings: Settings,
): Promise<Analysis> {
  const data = new FormData();
  data.append("file", file);
  data.append("settings", JSON.stringify(settings));
  return (
    await request("/datasets/analyze", { method: "POST", body: data })
  ).json();
}
export async function sample(name = "problematic"): Promise<Analysis> {
  return (await request(`/datasets/sample/${name}`, { method: "POST" })).json();
}
export async function compare(
  baseline_id: string,
  current_id: string,
  sensitivity: string,
): Promise<Comparison> {
  return (
    await request("/datasets/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseline_id, current_id, sensitivity }),
    })
  ).json();
}
export async function exportReport(id: string, format: string) {
  const response = await request(`/report/${id}/export?format=${format}`, {
    method: "POST",
  });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `analyset-${id.slice(0, 8)}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
