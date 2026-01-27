import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60">
            {/* Checkbox */}
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            {/* Expander */}
            <TableHead className="w-8">
               <Skeleton className="h-4 w-4" />
            </TableHead>
            {/* Order ID */}
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            {/* Customer */}
            <TableHead>
              <Skeleton className="h-4 w-24" />
            </TableHead>
            {/* Mobile */}
            <TableHead>
              <Skeleton className="h-4 w-20" />
            </TableHead>
             {/* Status */}
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            {/* Fatoura Stage */}
            <TableHead>
               <Skeleton className="h-4 w-20" />
            </TableHead>
            {/* Fatoura */}
            <TableHead>
               <Skeleton className="h-4 w-16" />
            </TableHead>
            {/* Delivery */}
            <TableHead>
              <Skeleton className="h-4 w-20" />
            </TableHead>
            {/* Total */}
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            {/* Paid */}
             <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            {/* Balance */}
             <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
             {/* R1, R2, R3, Call, Escalated */}
             {Array.from({ length: 5 }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-8" />
                </TableHead>
             ))}
             {/* Open */}
             <TableHead className="w-10">
               <Skeleton className="h-4 w-4" />
             </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i} className="border-b border-border/40">
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-4" />
               </TableCell>
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-4" />
               </TableCell>
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-16" />
               </TableCell>
               <TableCell className="py-3">
                 <div className="space-y-1">
                   <Skeleton className="h-3 w-24" />
                   <Skeleton className="h-2 w-16" />
                 </div>
               </TableCell>
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-20" />
               </TableCell>
                <TableCell className="py-3">
                 <Skeleton className="h-5 w-16 rounded-full" />
               </TableCell>
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-16" />
               </TableCell>
               <TableCell className="py-3">
                 <Skeleton className="h-4 w-12" />
               </TableCell>
                <TableCell className="py-3">
                 <Skeleton className="h-4 w-20" />
               </TableCell>
                <TableCell className="py-3">
                 <Skeleton className="h-4 w-16" />
               </TableCell>
                <TableCell className="py-3">
                 <Skeleton className="h-4 w-16" />
               </TableCell>
                <TableCell className="py-3">
                 <Skeleton className="h-4 w-16" />
               </TableCell>
                {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j} className="py-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </TableCell>
                 ))}
                 <TableCell className="py-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                 </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}