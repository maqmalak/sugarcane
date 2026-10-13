import { Link } from "react-router-dom";

export function NotFoundPage({ title = "Page not found", message = "This page doesn't exist." }: { title?: string; message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link to="/" className="text-sm text-primary hover:underline">Go home</Link>
    </div>
  );
}
