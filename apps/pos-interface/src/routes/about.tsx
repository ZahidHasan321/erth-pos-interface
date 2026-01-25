import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
  head: () => ({
    meta: [{
      title: "About Us",
    }]
  }),
});

function About() {
  return <div className="p-2">Hello from About!</div>;
}
