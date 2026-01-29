import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  MessageSquare, 
  Phone, 
  Plus, 
  Loader2, 
  Save 
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { updateOrder } from "@/api/orders";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { 
  day: "numeric", 
  month: "short" 
});

function formatDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateFormatter.format(parsed);
}

// --- SHARED UPDATE LOGIC ---
function useOrderUpdate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, any> }) => {
       // id is string but API expects number
       const numericId = parseInt(id);
       return updateOrder(updates, numericId);
    },
    onSuccess: async () => {
      // Invalidate everything to be safe and ensure table refreshes
      await queryClient.invalidateQueries(); 
      toast.success("Order updated successfully");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to update order");
    },
  });
}

// --- 1. REMINDER CELL (R1, R2, R3, Escalation) ---
type ReminderType = "R1" | "R2" | "R3" | "Escalation";

interface ReminderCellProps {
  orderId: string;
  type: ReminderType;
  date?: string;
  note?: string;
  colorClass?: string;
}

export function ReminderCell({ orderId, type, date, note, colorClass }: ReminderCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Local state for the form
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const updateMutation = useOrderUpdate();

  const handleOpen = (open: boolean) => {
    if (open) {
      // Ensure YYYY-MM-DD
      const d = date ? new Date(date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      setEditDate(d);
      setEditNote(note || "");
    }
    setIsOpen(open);
  };

  const handleSave = async () => {
    let updates: Record<string, any> = {};
    
    if (type === "Escalation") {
      updates = {
        escalation_date: editDate,
        escalation_notes: editNote,
      };
    } else {
      const fieldPrefix = type.toLowerCase(); // r1, r2, r3
      updates = {
        [`${fieldPrefix}_date`]: editDate,
        [`${fieldPrefix}_notes`]: editNote,
      };
    }

    try {
      await updateMutation.mutateAsync({ id: orderId, updates });
      setIsOpen(false);
    } catch (error) {
      // Error is handled by mutation hook
    }
  };

  const formattedDate = formatDate(date);
  const hasData = !!date;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "h-8 px-2 text-xs font-medium w-full justify-start transition-all", 
                  hasData ? colorClass : "text-muted-foreground opacity-70 hover:opacity-100 hover:text-foreground"
                )}
              >
                {hasData ? (
                  <div className="flex items-center gap-1.5">
                    <span>{formattedDate}</span>
                    {note && <MessageSquare className="h-3 w-3 opacity-70" />}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    <span>Add</span>
                  </div>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-[200px]">
             {hasData ? (
               <div className="space-y-1">
                 <p className="font-semibold text-xs">{type} Details</p>
                 <p className="text-xs text-muted-foreground break-words">{note || "No notes"}</p>
                 <p className="text-[10px] text-blue-500 pt-1">Click to edit</p>
               </div>
             ) : (
               <p>Add {type} details</p>
             )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {type}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder={`Enter ${type} notes...`}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
               <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
               <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- 2. CALL CELL (Date, Status, Note) ---
interface CallCellProps {
  orderId: string;
  date?: string;
  status?: string;
  note?: string;
}

export function CallCell({ orderId, date, status, note }: CallCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Local form state
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");

  const updateMutation = useOrderUpdate();

  const handleOpen = (open: boolean) => {
    if (open) {
      const d = date ? new Date(date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      setEditDate(d);
      setEditStatus(status || "");
      setEditNote(note || "");
    }
    setIsOpen(open);
  };

  const handleSave = async () => {
    const updates = {
      call_reminder_date: editDate,
      call_status: editStatus,
      call_notes: editNote
    };

    try {
      await updateMutation.mutateAsync({ id: orderId, updates });
      setIsOpen(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  const formattedDate = formatDate(date);
  const hasData = !!date || !!status;

  const statusColors: Record<string, string> = {
    "Connected": "bg-green-100 text-green-700 border-green-200",
    "Busy": "bg-orange-100 text-orange-700 border-orange-200",
    "No Answer": "bg-yellow-100 text-yellow-700 border-yellow-200",
    "Switched off": "bg-gray-100 text-gray-700 border-gray-200"
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                className={cn(
                  "h-auto py-1 px-2 flex flex-col gap-1 items-start w-full transition-all",
                  hasData ? "hover:bg-muted/50" : "opacity-70 hover:opacity-100"
                )}
              >
                {hasData ? (
                  <>
                    <span className="text-xs font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {formattedDate || <span className="text-muted-foreground">No Date</span>}
                    </span>
                    {status && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-medium flex items-center gap-1 whitespace-nowrap", 
                        statusColors[status] || "bg-gray-100"
                      )}>
                        {status}
                        {note && <MessageSquare className="h-2.5 w-2.5 opacity-60 ml-0.5" />}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Plus className="h-3 w-3" />
                    <span>Log Call</span>
                  </div>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-[200px]">
            {hasData ? (
               <div className="space-y-1">
                 <p className="font-semibold text-xs">Call Log</p>
                 <p className="text-xs">{status || "No Status"}</p>
                 {note && <p className="text-xs text-muted-foreground border-t pt-1 mt-1 break-words">{note}</p>}
                 <p className="text-[10px] text-blue-500 pt-1">Click to update</p>
               </div>
             ) : (
               <p>Log a call</p>
             )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Call Log</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="call-date">Date</Label>
            <Input
              id="call-date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="call-status">Status</Label>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger id="call-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Connected">Connected</SelectItem>
                <SelectItem value="Busy">Busy</SelectItem>
                <SelectItem value="No Answer">No Answer</SelectItem>
                <SelectItem value="Switched off">Switched off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="call-notes">Notes</Label>
            <Textarea
              id="call-notes"
              placeholder="Enter call notes..."
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
               <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
               <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
