import { useAuth } from "@/context/auth";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { Badge } from "@repo/ui/badge";
import { Separator } from "@repo/ui/separator";

export const Route = createFileRoute("/$main/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Profile" }],
  }),
});

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 border-red-200",
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  manager: "bg-blue-100 text-blue-800 border-blue-200",
  staff: "bg-slate-100 text-slate-700 border-slate-200",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  shop: "Showroom",
  workshop: "Workshop",
};

function ProfilePage() {
  const { user } = useAuth();
  const { main } = useParams({ strict: false });

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = user.role
    ? user.role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const departmentLabel = user.department
    ? (DEPARTMENT_LABELS[user.department] ?? user.department)
    : null;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account information
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Left column: identity card ── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 rounded-xl">
              <AvatarFallback className="rounded-xl bg-primary/10 text-xl font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h2 className="mt-4 text-lg font-bold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {roleLabel && (
                <Badge
                  variant="outline"
                  className={ROLE_COLORS[user.role ?? ""] ?? ""}
                >
                  {roleLabel}
                </Badge>
              )}
              {departmentLabel && (
                <Badge variant="secondary">{departmentLabel}</Badge>
              )}
            </div>
          </div>

          <Separator className="my-5" />

          {/* Contact info under avatar */}
          <div className="space-y-3 text-sm">
            <InfoRow label="Email" value={user.email} />
            <InfoRow label="Phone" value={user.phone} />
            <InfoRow label="Employee ID" value={user.employee_id} />
          </div>
        </div>

        {/* ── Right column: details grid ── */}
        <div className="space-y-6">
          {/* Account details */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-6 py-4">
              <h3 className="text-sm font-semibold">Account Details</h3>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              <DetailCell label="Full Name" value={user.name} />
              <DetailCell label="Username" value={user.username} />
              <DetailCell label="Role" value={roleLabel ?? "Not assigned"} />
              <DetailCell
                label="Department"
                value={departmentLabel ?? "Not assigned"}
              />
              <DetailCell label="Email" value={user.email ?? "Not set"} />
              <DetailCell label="Phone" value={user.phone ?? "Not set"} />
            </div>
          </div>

          {/* Brand access */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-6 py-4">
              <h3 className="text-sm font-semibold">Brand Access</h3>
            </div>
            <div className="px-6 py-5">
              <div className="flex flex-wrap gap-2">
                {user.brands.length > 0 ? (
                  user.brands.map((brand) => (
                    <Badge
                      key={brand}
                      variant="outline"
                      className="capitalize"
                    >
                      {brand}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    All brands
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Currently viewing:{" "}
                <span className="font-semibold capitalize text-foreground">
                  {main}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate max-w-[180px] text-right">
        {value ?? "Not set"}
      </span>
    </div>
  );
}

function DetailCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card px-6 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
