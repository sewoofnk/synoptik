// Web Worker: výpočet izočiar mimo hlavného vlákna.
import { computeContours, type ContourRequest } from "./contours";

self.onmessage = (e: MessageEvent<ContourRequest & { id: number }>) => {
  const { id, ...req } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, features: computeContours(req) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
