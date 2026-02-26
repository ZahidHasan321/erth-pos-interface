"use client";

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Package,
  Search,
  ExternalLink,
  PlusCircle,
  Truck,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SearchCustomer } from "@/components/forms/customer-demographics/search-customer";

// Route Definition
export const Route = createFileRoute("/$main/orders/order-management/alterations")({
  component: AlterationsManagementInterface,
  head: () => ({
    meta: [{ title: "Alterations Management" }],
  }),
});

function AlterationsManagementInterface() {
  const [searchId, setSearchId] = useState("");

  const handleCreateAlteration = () => {
    toast.info("Opening New Alteration (Out) Flow...");
    // Logic to open new alteration wizard
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto p-4 md:p-8 max-w-7xl space-y-8 pb-24"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
          <div>
              <h1 className="text-4xl font-black text-foreground uppercase tracking-tight">
                  Alterations <span className="text-primary">Center</span>
              </h1>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest mt-1">
                  Manage external alterations and customer requests
              </p>
          </div>
          <Button 
            onClick={handleCreateAlteration}
            className="h-12 px-8 font-black uppercase tracking-widest shadow-lg shadow-primary/20 rounded-2xl"
          >
              <PlusCircle className="w-5 h-5 mr-2" />
              New Alteration (Out)
          </Button>
      </motion.div>

      {/* Quick Search & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.div variants={itemVariants} className="lg:col-span-7">
              <Card className="border-2 shadow-md rounded-3xl overflow-hidden h-full">
                  <CardHeader className="bg-muted/30 border-b p-6">
                      <div className="flex items-center gap-3">
                          <Search className="w-5 h-5 text-primary" />
                          <CardTitle className="text-lg font-black uppercase">Find Alteration Order</CardTitle>
                      </div>
                  </CardHeader>
                  <CardContent className="p-6">
                      <SearchCustomer onCustomerFound={(c) => toast.info(`Viewing alterations for ${c.name}`)} onHandleClear={() => {}} />
                  </CardContent>
              </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-5">
              <Card className="border-2 shadow-md rounded-3xl overflow-hidden h-full">
                  <CardHeader className="bg-muted/30 border-b p-6">
                      <div className="flex items-center gap-3">
                          <Truck className="w-5 h-5 text-primary" />
                          <CardTitle className="text-lg font-black uppercase">Quick Status Check</CardTitle>
                      </div>
                  </CardHeader>
                  <CardContent className="p-6 flex flex-col gap-4">
                      <div className="flex gap-2">
                          <Input 
                            placeholder="Enter Order ID or Invoice..." 
                            className="h-12 rounded-xl font-bold"
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                          />
                          <Button className="h-12 px-6 rounded-xl" variant="secondary">
                              <ExternalLink className="w-4 h-4" />
                          </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="px-3 py-1 font-black text-[10px] uppercase">Pending (12)</Badge>
                          <Badge variant="outline" className="px-3 py-1 font-black text-[10px] uppercase">At Workshop (5)</Badge>
                          <Badge variant="outline" className="px-3 py-1 font-black text-[10px] uppercase">Ready (8)</Badge>
                      </div>
                  </CardContent>
              </Card>
          </motion.div>
      </div>

      {/* Main View - Empty State */}
      <motion.div 
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-[3rem] bg-muted/5"
      >
          <div className="size-20 bg-muted/30 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Package className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Queue Analysis</h3>
          <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-1 max-w-xs">
              Search for a customer or order to view active alteration lifecycles
          </p>
      </motion.div>
    </motion.div>
  );
}
