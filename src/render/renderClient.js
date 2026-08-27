import { localPreviewAdapter } from "./localPreviewAdapter";

// Provider-neutral application boundary. Swap this adapter for an internal
// server endpoint without changing the UI contract.
export function renderScene(request, onProgress) {
  return localPreviewAdapter.createRender(request, onProgress);
}
