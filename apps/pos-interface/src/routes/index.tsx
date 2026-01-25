import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [{
      title: "Welcome",
    }],
  links:[{
    rel:'icon',
    type:"image/svg+xml",
    href: "/erth-dark.svg"
  }]
  }),
});

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        navigate({ to: "/home" });
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-8">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-6xl font-extrabold text-foreground mb-6 tracking-tight">
          Welcome
        </h1>
        <p className="text-xl text-muted-foreground mb-12">
          Your tailoring management system
        </p>

        <Link to="/home">
          <Button
            size="lg"
            className="text-lg px-12 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
          >
            Press Enter to Continue
          </Button>
        </Link>
      </div>
    </div>
  );
}
