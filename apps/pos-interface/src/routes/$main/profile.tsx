import { useAuth } from "@/context/auth";
import { createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { Badge } from "@repo/ui/badge";
import { Separator } from "@repo/ui/separator";
import {
  Building2,
  IdCard,
  Mail,
  Phone,
  Shield,
  UserCircle,
} from "lucide-react";

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
  shop: "Shop",
  workshop: "Workshop",
};

function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = user.role
    ? user.role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const departmentLabel = user.department
    ? DEPARTMENT_LABELS[user.department] ?? user.department
    : null;

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-8">
      {/* Header */}
      <div className="flex items-center gap-5">
        <Avatar className="h-20 w-20 rounded-xl">
          <AvatarFallback className="rounded-xl bg-primary/10 text-2xl font-bold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          <div className="flex items-center gap-2">
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
      </div>

      <Separator className="my-6" />

      {/* Details */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Details
        </h2>
        <div className="mt-3 rounded-lg border bg-card">
          <ProfileRow icon={UserCircle} label="Full Name" value={user.name} />
          <ProfileRow
            icon={Shield}
            label="Role"
            value={roleLabel ?? "Not assigned"}
          />
          <ProfileRow
            icon={Building2}
            label="Department"
            value={departmentLabel ?? "Not assigned"}
          />
          <ProfileRow
            icon={IdCard}
            label="Employee ID"
            value={user.employee_id ?? "Not assigned"}
          />
          <ProfileRow
            icon={Mail}
            label="Email"
            value={user.email ?? "Not set"}
          />
          <ProfileRow
            icon={Phone}
            label="Phone"
            value={user.phone ?? "Not set"}
            isLast
          />
        </div>
      </div>

      <Separator className="my-6" />

      {/* Brand Access */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Brand Access
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.brands.length > 0 ? (
            user.brands.map((brand) => (
              <Badge key={brand} variant="outline" className="capitalize">
                {brand}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">All brands</span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Currently viewing:{" "}
          <span className="font-medium capitalize text-foreground">
            {user.userType}
          </span>
        </p>
      </div>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  isLast = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${!isLast ? "border-b" : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
