import { createFileRoute, redirect } from "@tanstack/react-router";

// Investigations were folded into the consolidated Decisions hub (CLAUDE.md §6).
// Kept as a redirect so existing links/bookmarks/notifications still resolve.
export const Route = createFileRoute("/(main)/investigations")({
  beforeLoad: () => {
    throw redirect({ to: "/decisions" });
  },
});
