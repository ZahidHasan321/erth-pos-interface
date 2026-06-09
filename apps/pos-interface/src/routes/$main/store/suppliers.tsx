import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, Archive, ArchiveRestore, Loader2, Mail, Pencil, Phone, Plus, Search, Users,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import { Switch } from "@repo/ui/switch";
import { Textarea } from "@repo/ui/textarea";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Badge } from "@repo/ui/badge";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import { getSuppliers, createSupplier, updateSupplier, archiveSupplier } from "@/api/suppliers";
import type { Supplier } from "@repo/database";

export const Route = createFileRoute("/$main/store/suppliers")({
  component: SuppliersPage,
  head: () => ({ meta: [{ title: "Suppliers" }] }),
});

function SuppliersPage() {
  const { main } = Route.useParams();
  const { user } = useAuth();
  const canManage = getPermission(user, "suppliers:manage") === "full";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", { showArchived }],
    queryFn: () => getSuppliers(showArchived),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const createMut = useMutation({
    mutationFn: (input: Pick<Supplier, "name"> & Partial<Pick<Supplier, "phone" | "email" | "notes">>) => createSupplier(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      toast.success("Supplier added");
    },
    onError: (err: unknown) => toast.error(`Could not add supplier: ${err instanceof Error ? err.message : String(err)}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...patch }: { id: number } & Partial<Supplier>) => updateSupplier(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success("Supplier updated");
    },
    onError: (err: unknown) => toast.error(`Could not update supplier: ${err instanceof Error ? err.message : String(err)}`),
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, restore }: { id: number; restore: boolean }) =>
      restore ? updateSupplier(id, { is_archived: false }) : archiveSupplier(id).then(() => undefined as undefined),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setArchiveTarget(null);
      toast.success(vars.restore ? "Supplier restored" : "Supplier archived");
    },
    onError: (err: unknown) => toast.error(`Could not update supplier: ${err instanceof Error ? err.message : String(err)}`),
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const phone = (fd.get("phone") as string).trim() || null;
    const email = (fd.get("email") as string).trim() || null;
    const notes = (fd.get("notes") as string).trim() || null;
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, phone, email, notes });
    } else {
      createMut.mutate({ name, phone: phone ?? undefined, email: email ?? undefined, notes: notes ?? undefined });
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1200px] mx-auto pb-10">
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link to="/$main/store/inventory" params={{ main }}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-5 w-5" /> Suppliers
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">People you restock inventory from</p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Supplier
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show archived
        </label>
      </div>

      <Card>
        <CardContent className="py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="py-10 text-center">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
              <p className="font-medium text-sm">Failed to load suppliers</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
            </div>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className={cn(s.is_archived && "opacity-60")}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {s.name}
                          {s.is_archived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.phone ? (
                          <span className="inline-flex items-center gap-1.5 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{s.phone}</span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {s.email ? (
                          <span className="inline-flex items-center gap-1.5 text-sm"><Mail className="h-3 w-3 text-muted-foreground" />{s.email}</span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                        {s.notes ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {s.is_archived ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => archiveMut.mutate({ id: s.id, restore: true })}
                                title="Restore"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setArchiveTarget(s)} title="Archive">
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        {suppliers.length === 0 ? "No suppliers yet. Add one to start tracking restocks." : "No suppliers match the search."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
            <DialogDescription>Suppliers can be picked when restocking inventory.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-4">
              <div>
                <Label htmlFor="sup-name" className="text-xs text-muted-foreground">Name *</Label>
                <Input id="sup-name" name="name" defaultValue={editing?.name ?? ""} required autoFocus placeholder="e.g. Al-Bayan Textiles" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sup-phone" className="text-xs text-muted-foreground">Phone</Label>
                  <Input id="sup-phone" name="phone" defaultValue={editing?.phone ?? ""} placeholder="+965…" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="sup-email" className="text-xs text-muted-foreground">Email</Label>
                  <Input id="sup-email" name="email" type="email" defaultValue={editing?.email ?? ""} placeholder="optional" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="sup-notes" className="text-xs text-muted-foreground">Notes</Label>
                <Textarea id="sup-notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} placeholder="Payment terms, lead time, contact person…" className="mt-1 resize-none" />
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editing ? "Save changes" : "Add supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`Archive "${archiveTarget?.name}"?`}
        description="The supplier will be hidden from restock pickers but past stock movements remain linked."
        confirmText="Archive"
        onConfirm={() => archiveTarget && archiveMut.mutate({ id: archiveTarget.id, restore: false })}
      />
    </div>
  );
}
