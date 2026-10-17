// Test-environment compatibility shim.
// happy-dom intentionally does not provide every browser dialog API. Production browsers do.
// Define only the missing function so tests can spy on it without changing application behavior.
if (typeof window !== "undefined" && typeof window.confirm !== "function") {
  Object.defineProperty(window, "confirm", {
    configurable: true,
    writable: true,
    value: () => false,
  });
}
