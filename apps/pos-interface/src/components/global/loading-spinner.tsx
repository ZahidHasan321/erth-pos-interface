export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen" role="status" aria-label="Loading">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary"></div>
    </div>
  );
}
